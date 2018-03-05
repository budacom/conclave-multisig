const lightwallet = require('eth-lightwallet');
const _ = require('lodash');
const RLP = require('rlp');

const {
  wait, assertItFails, assertLogContains
} = require('./support/helpers');

const {
  generateSigners, buildTx, signTx, encodeFunction, randomAddress, randomParams, ether, gwei
} = require('./support/ethereum');

var ManagedMultiSig = artifacts.require("./ManagedMultiSig.sol")
var TestRegistry = artifacts.require("./TestRegistry.sol")

contract('ManagedMultiSig', function(fundedAccounts) {
  let wallet;
  const manager = fundedAccounts[0];
  const vc = fundedAccounts[1];
  let accounts;

  before(wait(async () => {
    accounts = await generateSigners();
  }));

  beforeEach(wait(async () => {
    wallet = await ManagedMultiSig.new({ from: manager });
  }));

  it("adds deploying account as manager", wait(async () => {
    assert.equal(await wallet.manager(), manager);
  }));

  describe("activate", () => {
    let signers;

    before(() => {
      signers = [accounts[0], accounts[1], accounts[2]].sort();
    });

    it("sets the onwers and threshold for the wallet", wait(async () => {
      await wallet.activate(2, signers, 0, { from: manager });

      assert(await wallet.isOwner(accounts[1]));
      assert(await wallet.isOwner(accounts[2]));
      assert(!await wallet.isOwner(accounts[4]));
      assert.equal((await wallet.threshold()).toNumber(), 2);
    }));

    it("fails if called by an account that is not the manager", wait(async () => {
      await assertItFails(wallet.activate(2, signers, 0, { from: accounts[1] }));
    }));

    it("fails if called on an already active wallet", wait(async () => {
      await wallet.activate(2, signers, 0, { from: manager });
      await assertItFails(wallet.activate(2, signers, 0, { from: manager }));
    }));

    it("fails if given owner array is not sorted ascending");
  });

  describe("execute", () => {
    let signers;
    let nonce, destination, amount, gasPrice, gasLimit;

    describe("given a 2 out of 3 funded wallet", () => {
      before(() => {
        signers = [accounts[0], accounts[1], accounts[2]].sort();
      });

      beforeEach(wait(async () => {
        await wallet.activate(2, signers, 0, { from: manager });
        await wallet.sendTransaction({ from: vc, value: ether(1) });

        nonce = await wallet.fullNonce();
        ({ destination, amount, gasPrice } = randomParams());
      }));

      [[0, 1], [1, 2], [0, 2]].forEach(([a, b]) => {
        it(`succeeds with signers [${a}, ${b}]`, wait(async () => {
          const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
          const { v, r, s } = signTx(transaction, [signers[a], signers[b]]);

          const result = await wallet.execute(
            v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
          );

          assert.equal(web3.eth.getBalance(destination).toNumber(), amount);
          assertLogContains(result, 'Result', { succeeded: true });
        }));
      });

      it('properly calls a contract function', wait(async () => {
        const reg = await TestRegistry.new({ from: vc });
        const number = 12345;
        const data = encodeFunction('register', ['uint256'], [number]);

        const transaction = buildTx(nonce, reg.address, amount, 50000, gasPrice, data);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        );

        assert.equal((await reg.registry(wallet.address)).toNumber(), number);
        assertLogContains(result, 'Result', { succeeded: true });
      }));

      it('properly deploys a contract');

      it('sets succeeded flag of Result event to false if internal tx fails', wait(async () => {
        const reg = await TestRegistry.new({ from: vc });
        const data = encodeFunction('fail', [], []);

        const transaction = buildTx(nonce, reg.address, amount, 50000, gasPrice, data);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        );

        assertLogContains(result, 'Result', { succeeded: false });
      }));

      it('increments the nonce value on transaction success', wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        );

        assertLogContains(result, 'Result', { succeeded: true });
        assert.equal(await wallet.fullNonce(), nonce.toNumber() + 1);
      }));

      it('increments the nonce value on transaction error', wait(async () => {
        const reg = await TestRegistry.new({ from: vc });
        const data = encodeFunction('fail', [], []);

        const transaction = buildTx(nonce, reg.address, amount, 50000, gasPrice, data);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        );

        assertLogContains(result, 'Result', { succeeded: false });
        assert.equal(await wallet.fullNonce(), nonce.toNumber() + 1);
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
        const transaction = buildTx(nonce.add(1), destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        ));
      }));

      it('fails if gas price does not match', wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice.add(1) }
        ));
      }));

      it('fails if there is not enough gas to cover user gasLimit', wait(async () => {
        const transaction = buildTx(nonce, destination, amount, 500000, 1);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        await assertItFails(wallet.execute(
          v, r, s, transaction, { from: manager, gas: 600000, gasPrice: 1 } // about 110k is req
        ));
      }));

      it('uses less than 75k gas on simple transaction on existing account', wait(async () => {
        const transaction = buildTx(nonce, fundedAccounts[8], amount, 50000, 1);
        const { v, r, s } = signTx(transaction, [signers[0], signers[2]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: 1 }
        );

        assertLogContains(result, 'Result', { succeeded: true });
        // console.log(result.logs[0].args.fee.toNumber());
        assert.isBelow(result.receipt.gasUsed, 75000);
        assert.isBelow(result.logs[0].args.fee, 75000);
      }));
    });
  });

  // GAS COST ESTIMATION

  [2, 4, 6, 10].forEach((p) => {
    describe(`given a ${p} out of ${p} wallet that is funded`, () => {
      let signers;
      let nonce, destination, amount, gasPrice, gasLimit;

      before(() => {
        signers = accounts.slice(0, p).sort();
      });

      describe.only('activate', () => {
        it('completely refunds manager if proper fee is used', wait(async () => {
          const initialBalance = web3.eth.getBalance(manager);
          const newWallet = await ManagedMultiSig.new({ from: manager, gasPrice: 1 });
          await newWallet.sendTransaction({ from: vc, value: ether(1) });

          const fee = 911177 + (p * 22208);
          await newWallet.activate(p, signers, fee, { from: manager, gasPrice: 1 });

          const difference = web3.eth.getBalance(manager).minus(initialBalance).toNumber();
          // console.log(difference);
          assert.equal(difference, 0);
        }));
      });

      describe('and active', () => {
        beforeEach(wait(async () => {
          await wallet.sendTransaction({ from: vc, value: ether(1) });
          await wallet.activate(p, signers, 0, { from: manager });

          nonce = await wallet.fullNonce();
          ({ destination, amount, gasPrice } = randomParams());
        }));

        describe('execute', () => {
          it('succeeds and completely refunds manager', wait(async () => {
            const initialBalance = web3.eth.getBalance(manager);
            const transaction = buildTx(nonce, destination, 111111111111111111, 50000, 1);
            const { v, r, s } = signTx(transaction, signers);

            const result = await wallet.execute(
              v, r, s, transaction, { from: manager, gas: 500000, gasPrice: 1 }
            );

            assert.equal(web3.eth.getBalance(destination).toNumber(), 111111111111111111);
            assertLogContains(result, 'Result', { succeeded: true });

            const difference = web3.eth.getBalance(manager).minus(initialBalance).toNumber();
            // console.log(difference);
            assert.isAtLeast(difference, 0);
            assert.isBelow(difference, 1000);
          }));

          it('succeeds and completely refunds manager with data', wait(async () => {
            const reg = await TestRegistry.new({ from: vc });
            const number = 12345;
            const data = encodeFunction('register', ['uint256'], [number]);

            const initialBalance = web3.eth.getBalance(manager);
            const transaction = buildTx(nonce, reg.address, amount, 50000, 1, data);
            const { v, r, s } = signTx(transaction, signers);

            const result = await wallet.execute(
              v, r, s, transaction, { from: manager, gas: 500000, gasPrice: 1 }
            );

            assertLogContains(result, 'Result', { succeeded: true });
            assert.equal((await reg.registry(wallet.address)).toNumber(), number);

            const difference = web3.eth.getBalance(manager).minus(initialBalance).toNumber();
            // console.log(difference);
            assert.isAtLeast(difference, 0);
            assert.isBelow(difference, 1000);
          }));
        });
      });
    });
  });
});
