const {
  wait, assertItFails, assertTxSucceeded
} = require('./support/helpers');

const {
  generateSigners, buildTx, signTx, encodeFunction, randomAddress, randomParams, ether, gwei
} = require('./support/ethereum');

var WhitelistedMultiSig = artifacts.require("./WhitelistedMultiSig.sol")

contract('WhitelistedMultiSig', function(fundedAccounts) {
  const delegate = fundedAccounts[0];
  const vc = fundedAccounts[1];
  let accounts;
  let signers;

  before(wait(async () => {
    accounts = await generateSigners();
    signers = [accounts[0], accounts[1], accounts[2]].sort();
  }));

  describe("execute", () => {
    let wallet;
    let nonce, destination, amount, gasPrice, gasLimit;

    beforeEach(wait(async () => {
      wallet = await WhitelistedMultiSig.new(2, signers, { from: delegate, gas: 2000000 });
      await wallet.sendTransaction({ from: vc, value: ether('1') });

      nonce = await wallet.fullNonce();
      ({ destination, amount, gasPrice } = randomParams());
    }));

    it('fails if transaction is sent to non-whitelisted address', wait(async () => {
      const transaction = buildTx(nonce, destination, amount, 50000, gasPrice);
      const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

      await assertItFails(wallet.execute(
        v, r, s, transaction, { from: delegate, gas: 500000, gasPrice: gasPrice }
      ));
    }));

    it('succeedes if transaction is sent to one of the owners', wait(async () => {
      const transaction = buildTx(nonce, signers[0], amount, 50000, gasPrice);
      const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

      await assertTxSucceeded(wallet.execute(
        v, r, s, transaction, { from: delegate, gas: 500000, gasPrice: gasPrice }
      ));
    }));

    describe("given a whitelisted destination", () => {
      beforeEach(wait(async () => {
        const data = encodeFunction('setWhitelisted', ['address', 'bool'], [destination, true]);
        const transaction = buildTx(nonce, wallet.address, 0, 100000, gasPrice, data);
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        await assertTxSucceeded(wallet.execute(
          v, r, s, transaction, { from: delegate, gas: 500000, gasPrice: gasPrice }
        ));
      }));

      it('succeedes if sent to it', wait(async () => {
        const transaction = buildTx(
          nonce.add(new web3.utils.BN('1')), destination, amount, 50000, gasPrice
        );
        
        const { v, r, s } = signTx(transaction, [signers[0], signers[1]]);

        await assertTxSucceeded(wallet.execute(
          v, r, s, transaction, { from: delegate, gas: 500000, gasPrice: gasPrice }
        ));
      }));
    });
  });
});
