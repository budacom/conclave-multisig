const {
  wait, assertItFails, assertLogContains
} = require('./support/helpers');

const {
  generateSigners, buildTx, signTx, encodeFunction, randomAddress, randomParams, ether, gwei
} = require('./support/ethereum');

var ManagedWhitelistedMultiSig = artifacts.require("./ManagedWhitelistedMultiSig.sol")

contract('ManagedWhitelistedMultiSig', function(fundedAccounts) {
  let wallet;
  const manager = fundedAccounts[0];
  const vc = fundedAccounts[1];
  let accounts;

  before(wait(async () => {
    accounts = await generateSigners();
  }));

  beforeEach(wait(async () => {
    wallet = await ManagedWhitelistedMultiSig.new({ from: manager });
  }));

  describe("execute", () => {
    let signers;
    let nonce, destination, amount, gasPrice, gasLimit;

    before(() => {
      signers = [accounts[0], accounts[1], accounts[2]].sort();
    });

    beforeEach(wait(async () => {
      await wallet.activate(2, signers, 0, { from: manager });
      await wallet.sendTransaction({ from: vc, value: ether(1) });

      nonce = await wallet.fullNonce();
      ({ destination, amount, gasPrice } = randomParams());
    }));

    it('fails if transaction is sent to non-whitelisted address', wait(async () => {
      const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
      const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

      await assertItFails(wallet.execute(
        v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
      ));
    }));

    it('succeedes if transaction is sent to one of the owners', wait(async () => {
      const transaction = buildTx(nonce, signers[0], amount, 50000, gasPrice);
      const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

      const result = await wallet.execute(
        v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
      );

      assertLogContains(result, 'Result', { succeeded: true });
    }));

    describe("given a whitelisted destination", () => {
      beforeEach(wait(async () => {
        const data = encodeFunction('setWhitelisted', ['address', 'bool'], [destination, true]);
        const transaction = buildTx(nonce, wallet.address, 0, 100000, gasPrice, data);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        );

        assertLogContains(result, 'Result', { succeeded: true });
      }));

      it('succeedes if sent to it', wait(async () => {
        const transaction = buildTx(nonce.add(1), destination, amount, 50000, gasPrice);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        const result = await wallet.execute(
          v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
        );

        assertLogContains(result, 'Result', { succeeded: true });
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
          const newWallet = await ManagedWhitelistedMultiSig.new({ from: manager, gasPrice: 1 });
          await newWallet.sendTransaction({ from: vc, value: ether(1) });

          const fee = 989509 + (p * 22208);
          await newWallet.activate(p, signers, fee, { from: manager, gasPrice: 1 });

          const difference = web3.eth.getBalance(manager).minus(initialBalance).toNumber();
          // console.log(difference);
          assert.equal(difference, 0);
        }));
      });

      describe('and active with whitelisted transaction', () => {
        beforeEach(wait(async () => {
          await wallet.sendTransaction({ from: vc, value: ether(1) });
          await wallet.activate(p, signers, 0, { from: manager });

          nonce = await wallet.fullNonce();
          ({ destination, amount, gasPrice } = randomParams());

          const data = encodeFunction('setWhitelisted', ['address', 'bool'], [destination, true]);
          const transaction = buildTx(nonce, wallet.address, 0, 100000, gasPrice, data);
          const { v, r, s } = signTx(transaction, signers);

          await wallet.execute(
            v, r, s, transaction, { from: manager, gas: 500000, gasPrice: gasPrice }
          );
        }));

        describe('execute', () => {
          it('succeeds and completely refunds manager', wait(async () => {
            const initialBalance = web3.eth.getBalance(manager);
            const transaction = buildTx(nonce.add(1), destination, 111111111111111111, 50000, 1);
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
        });
      });
    })
  });
});
