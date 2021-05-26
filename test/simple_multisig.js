const lightwallet = require('eth-lightwallet');
const _ = require('lodash');
const RLP = require('rlp');

const {
  wait, assertItFails, assertTxSucceeded
} = require('./support/helpers');

const {
  generateSigners, buildTx, signTx, encodeFunction, randomAddress, randomParams, ether, gwei
} = require('./support/ethereum');

var SimpleMultiSig = artifacts.require("./SimpleMultiSig.sol")
var TestRegistry = artifacts.require("./TestRegistry.sol")

contract('SimpleMultiSig', function(fundedAccounts) {
  const manager = fundedAccounts[0];
  const otherManager = fundedAccounts[1];
  const vc = fundedAccounts[2];
  let accounts;

  before(wait(async () => {
    accounts = await generateSigners();
  }));

  describe("constructor", () => {
    let signers;

    before(() => {
      signers = [accounts[0], accounts[1], accounts[2]].sort();
    });

    it("sets the onwers and threshold for the wallet", wait(async () => {
      let wallet = await SimpleMultiSig.new(2, signers, { from: manager });

      assert(await wallet.isOwner(accounts[1]));
      assert(await wallet.isOwner(accounts[2]));
      assert(!await wallet.isOwner(accounts[4]));
      assert.equal((await wallet.threshold()).toNumber(), 2);
    }));

    it("fails if signers are not sorted");
  });

  describe("fullNonce", () => {
    let wallet, otherWallet;

    context("given a 2 out of 3 funded wallet", () => {
      beforeEach(wait(async () => {
        let signers = [accounts[0], accounts[1], accounts[2]].sort();
        wallet = await SimpleMultiSig.new(2, signers, { from: manager });
        otherWallet = await SimpleMultiSig.new(2, signers, { from: manager });
      }));

      it("generates same nonce for same caller", async () => {
        const firstNonce = await wallet.fullNonce(manager);
        const secondNonce = await wallet.fullNonce(manager);

        assert.equal(firstNonce.toString(), secondNonce.toString());
      });

      it("generates different nonces for different callers", async () => {
        const firstNonce = await wallet.fullNonce(manager);
        const secondNonce = await wallet.fullNonce(otherManager);

        assert.notEqual(firstNonce.toString(), secondNonce.toString());
      });

      it("generates different nonces for different wallets and same caller", async () => {
        const firstNonce = await wallet.fullNonce(manager);
        const secondNonce = await otherWallet.fullNonce(manager);

        assert.notEqual(firstNonce.toString(), secondNonce.toString());
      });
    });
  });

  describe("execute", () => {
    let wallet;
    let signers;
    let nonce, destination, amount, gasPrice, gasLimit;

    context("given a 2 out of 3 funded wallet", () => {
      beforeEach(wait(async () => {
        signers = [accounts[0], accounts[1], accounts[2]].sort();
        wallet = await SimpleMultiSig.new(2, signers, { from: manager });

        await wallet.sendTransaction({ from: vc, value: ether("2") });

        nonce = await wallet.fullNonce(manager);
        ({ destination, amount, gasPrice } = randomParams());
      }));

      [[0, 1], [1, 2], [0, 2]].forEach(([a, b]) => {
        it(`succeeds with signers [${a}, ${b}]`, wait(async () => {
          const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
          const { v, r, s } = signTx(transaction, [signers[a], signers[b]]);

          const result = await wallet.execute(
            v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
          );

          assert.equal(await web3.eth.getBalance(destination), amount);
        }));
      });

      it(`succeeds if gas price is less than payload gas price`, wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice.add(-1) }
        );

        assert.equal(await web3.eth.getBalance(destination), amount);
      }));

      it('properly calls a contract function', wait(async () => {
        const reg = await TestRegistry.new({ from: vc });
        const number = 12345;
        const data = encodeFunction('register', ['uint256'], [number]);

        const transaction = buildTx(nonce, reg.address, amount, 50000, gasPrice, data);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        );

        assert.equal((await reg.registry(wallet.address)), number);
      }));

      it('properly deploys a contract');

      it('increments the nonce value on transaction success', wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        );

        const nextNonce = await wallet.fullNonce(manager);

        assert.equal(nextNonce.toString(), nonce.add(new web3.utils.BN("1")).toString());
      }));

      it('fails if signatures are not sorted', wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[1], signers[0]]);

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        ));
      }));

      it('fails if a signature is non owner', wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[0], accounts[5]].sort());

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        ));
      }));

      it('fails if repeated signature is used', wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[1], signers[1]]);

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        ));
      }));

      it('fails if less that threshold signatures are provided', wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[1]]);

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        ));
      }));

      it('fails if nonce does not match', wait(async () => {
        const transaction = buildTx(
          nonce.add(new web3.utils.BN('1')), destination, amount, 50000, gasPrice
        );

        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        ));
      }));

      it('fails if gas price is higher than payload gas price', wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice.add(1) }
        ));
      }));

      it('fails if call fails', wait(async () => {
        const reg = await TestRegistry.new({ from: vc });
        const data = encodeFunction('fail', [], []);

        const transaction = buildTx(nonce, reg.address, amount, 50000, gasPrice, data);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        ));
      }));

      it('uses less than 65k gas on simple transaction on existing account', wait(async () => {
        // first transaction only to set nonce
        let transaction = buildTx(nonce, fundedAccounts[8], amount, 50000, 1);
        let sign = signTx(transaction, [signers[0], signers[2]]);
        
        await wallet.execute(
          sign.v, sign.r, sign.s, transaction, { from: manager, gas: 500000, gasPrice: 1 }
        );

        transaction = buildTx(
          nonce.add(new web3.utils.BN('1')), fundedAccounts[8], amount, 50000, 1
        );

        sign = signTx(transaction, [signers[0], signers[2]]);

        const result = await wallet.execute(
          sign.v, sign.r, sign.s, transaction, { from: manager, gas: 500000, gasPrice: 1 }
        );

        console.log(`Gas used: ${result.receipt.gasUsed}`);
        assert.isBelow(result.receipt.gasUsed, 65000);
      }));
    });
  });

  // GAS COST ESTIMATION

  [2, 4, 6, 10].forEach((p) => {
    describe(`given a ${p} out of ${p} wallet that is funded`, () => {
      let signers;
      let nonce, destination, amount, gasPrice, gasLimit;

      beforeEach(wait(async () => {
        signers = accounts.slice(0, p).sort();
        wallet = await SimpleMultiSig.new(p, signers, { from: manager });

        await wallet.sendTransaction({ from: vc, value: ether("2") });

        nonce = await wallet.fullNonce(manager);
        ({ destination, amount, gasPrice } = randomParams());
      }));

      describe('execute', () => {
        it('succeeds and uses expected max gas', wait(async () => {
          // first transaction only to set nonce
          let transaction = buildTx(nonce, destination, 111111111111111111, 50000, 1);
          let sign = signTx(transaction, signers);

          await wallet.execute(
            sign.v, sign.r, sign.s, transaction, { from: manager, gas: 500000, gasPrice: 1 }
          );

          transaction = buildTx(
            nonce.add(new web3.utils.BN('1')), destination, 111111111111111111, 50000, 1
          );

          sign = signTx(transaction, signers);

          const result = await wallet.execute(
            sign.v, sign.r, sign.s, transaction, { from: manager, gas: 500000, gasPrice: 1 }
          );

          assert.isBelow(result.receipt.gasUsed, 72000 + p * 9550);
        }));
      });
    });
  });
});
