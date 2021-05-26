const lightwallet = require('eth-lightwallet');
const EthereumTx = require('ethereumjs-tx');
const EthUtil = require('ethereumjs-util');
const solsha3 = require('solidity-sha3').default;
const BigNumber = require('bignumber.js');

const ADDRESS_COUNT = 20;

let keystore;
let key;

function add0x (input_) {
  if (input_ === null) return undefined;

  let input = input_;

  if (typeof(input) === 'object') {
    input = input.toString(16);
  }

  if (typeof(input) === 'number') {
    input = input.toString(16);
    if (input.length % 2 === 1) input = `0${input}`;
  }

  if (input.slice(0, 2) !== '0x') {
    return `0x${input}`;
  }

  return input;
}

function strip0x (input) {
  return input.slice(2);
}

exports.generateSigners = function () {
  return new Promise((resolve_, _) => {
    lightwallet.keystore.createVault({
      hdPathString: "m/44'/60'/0'/0",
      seedPhrase: 'pull rent tower word science patrol economy legal yellow kit frequent fat',
      password: 'test',
      salt: 'testsalt',
    }, (_, keystore_) => {
      keystore = keystore_;
      keystore.keyFromPassword('test', (_, key_) => {
        key = key_;
        keystore.generateNewAddress(key, ADDRESS_COUNT);
        resolve_(keystore.getAddresses());
      });
    });
  });
};

exports.buildTx = function (nonce_, destination_, value_, gasLimit_, gasPrice_, data_) {
  const tx = {
    nonce: add0x(nonce_),
    to: add0x(destination_),
    value: add0x(value_),
    gasLimit: add0x(gasLimit_),
    gasPrice: add0x(gasPrice_),
    data: add0x(data_ || ''),
    chainId: 3, // EIP 155 chainId - mainnet: 1, ropsten: 3
  };

  return `0x${(new EthereumTx(tx)).serialize().toString('hex')}`;
};

exports.signTx = function (tx_, signers_) {
  const v = [];
  const r = [];
  const s = [];

  for (let i = 0; i < signers_.length; i++) {
    const privKey = keystore.exportPrivateKey(strip0x(signers_[i]), key);
    const txHash = EthUtil.keccak(new Buffer(strip0x(tx_), 'hex'));
    const sig = EthUtil.ecsign(txHash, new Buffer(privKey, 'hex'));

    v.push(sig.v);
    r.push(`0x${sig.r.toString('hex')}`);
    s.push(`0x${sig.s.toString('hex')}`);
  }

  return { v, r, s };
};

exports.encodeFunction = function(name_, proto_, params_) {
  return lightwallet.txutils._encodeFunctionTxData(name_, proto_, params_)
};

exports.randomAddress = function () {
  return solsha3(Math.random()).slice(0, 42);
};

exports.randomParams = function () {
  return {
    destination: exports.randomAddress(),
    amount: exports.ether((0.8 + Math.random() * 0.1).toFixed(5)),
    gasPrice: exports.gwei((10 + Math.random() * 20).toFixed(5)),
  };
};

exports.ether = function (amount_) {
  return new BigNumber(web3.utils.toWei(amount_, 'ether'));
};

exports.gwei = function (amount_) {
  return new BigNumber(web3.utils.toWei(amount_, 'gwei'));
};
