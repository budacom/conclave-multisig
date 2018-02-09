var ConclaveMultiSig = artifacts.require("./ConclaveMultiSig.sol")
var TestRegistry = artifacts.require("./TestRegistry.sol")

var lightwallet = require('eth-lightwallet')
const solsha3 = require('solidity-sha3').default
const Promise = require('bluebird')
const BigNumber = require('bignumber.js')
const EthereumTx = require('ethereumjs-tx');
const EthUtil = require('ethereumjs-util');

const web3SendTransaction = Promise.promisify(web3.eth.sendTransaction)
const web3GetBalance = Promise.promisify(web3.eth.getBalance)

function add0x (input) {
  if (typeof(input) === 'object') {
    input = input.toString(16);
  }

  if (typeof(input) === 'number') {
    input = input.toString(16);
    if(input.length % 2 == 1) input = '0' + input;
  }

  if (input.slice(0, 2) !== '0x') {
    return '0x' + input;
  }

  return input;
}

function strip0x (input) {
  return input.slice(2);
}

contract('ConclaveMultiSig', function(accounts) {
  let buildTx = function(nonce, destinationAddr, value, data) {
    const tx = {
      nonce: add0x(nonce),
      gasPrice: add0x(1), // this is ignored by contract
      gasLimit: add0x(150000),
      to: add0x(destinationAddr),
      value: add0x(value),
      data: add0x(data),
      chainId: 3, // EIP 155 chainId - mainnet: 1, ropsten: 3
    };

    return '0x' + (new EthereumTx(tx).serialize().toString('hex'));
  }

  let createSigs = function(signers, multisigAddr, tx) {
    let sigV = []
    let sigR = []
    let sigS = []

    for (var i = 0; i < signers.length; i++) {
      var privKey = lw.exportPrivateKey(strip0x(signers[i]), keyFromPw);
      const txHash = EthUtil.sha3(new Buffer(strip0x(tx), 'hex'))
      const sig = EthUtil.ecsign(txHash, new Buffer(privKey, 'hex'))

      sigV.push(sig.v)
      sigR.push('0x' + sig.r.toString('hex'))
      sigS.push('0x' + sig.s.toString('hex'))
    }

    // console.log({ sigV: sigV, sigR: sigR, sigS: sigS })

    return { sigV: sigV, sigR: sigR, sigS: sigS }
  }

  let executeSendSuccess = async function(owners, threshold, signers, done) {

    let multisig = await ConclaveMultiSig.new(threshold, owners, {from: accounts[0]})

    let randomAddr = solsha3(Math.random()).slice(0,42)

    // Receive funds
    await web3SendTransaction({from: accounts[0], to: multisig.address, value: web3.toWei(new BigNumber(0.1), 'ether')})

    let nonce = await multisig.nonce.call()
    assert.equal(nonce.toNumber(), 1)

    let bal = await web3GetBalance(multisig.address)
    assert.equal(bal, web3.toWei(0.1, 'ether'))

    // check that owners are stored correctly
    for (var i=0; i<owners.length; i++) {
      let ownerFromContract = await multisig.ownersArr.call(i)
      assert.equal(owners[i], ownerFromContract)
    }

    let value = web3.toWei(new BigNumber(0.01), 'ether')
    let fullNonce = await multisig.getFullNonce.call()
    let tx = buildTx(fullNonce, randomAddr, value, '0x')
    let sigs = createSigs(signers, multisig.address, tx)
    await multisig.execute(sigs.sigV, sigs.sigR, sigs.sigS, tx, {from: accounts[0], gasLimit: 1000000})

    // Check funds sent
    bal = await web3GetBalance(randomAddr)
    assert.equal(bal.toString(), value.toString())

    // Check nonce updated
    nonce = await multisig.nonce.call()
    assert.equal(nonce.toNumber(), 2)

    // Send again
    tx = buildTx(fullNonce.plus(1), randomAddr, value, '0x')
    sigs = createSigs(signers, multisig.address, tx)
    await multisig.execute(sigs.sigV, sigs.sigR, sigs.sigS, tx, {from: accounts[0], gasLimit: 1000000})

    // Check funds
    bal = await web3GetBalance(randomAddr)
    assert.equal(bal.toString(), (value*2).toString())

    // Check nonce updated
    nonce = await multisig.nonce.call()
    assert.equal(nonce.toNumber(), 3)

    // Test contract interactions
    let reg = await TestRegistry.new({from: accounts[0]})

    let number = 12345
    let data = lightwallet.txutils._encodeFunctionTxData('register', ['uint256'], [number])

    tx = buildTx(fullNonce.plus(2), reg.address, value, data)
    sigs = createSigs(signers, multisig.address, tx)
    await multisig.execute(sigs.sigV, sigs.sigR, sigs.sigS, tx, {from: accounts[0], gasLimit: 1000000})

    // Check that number has been set in registry
    let numFromRegistry = await reg.registry(multisig.address)
    assert.equal(numFromRegistry.toNumber(), number)

    // Check funds in registry
    bal = await web3GetBalance(reg.address)
    assert.equal(bal.toString(), value.toString())

    // Check nonce updated
    nonce = await multisig.nonce.call()
    assert.equal(nonce.toNumber(), 4)

    done()
  }

  let executeSendFailure = async function(owners, threshold, signers, done) {
    let multisig = await ConclaveMultiSig.new(threshold, owners, {from: accounts[0]})
    let nonce = await multisig.nonce.call()
    assert.equal(nonce.toNumber(), 1)

    // Receive funds
    await web3SendTransaction({from: accounts[0], to: multisig.address, value: web3.toWei(new BigNumber(2), 'ether')})

    let fullNonce = await multisig.getFullNonce.call()
    let randomAddr = solsha3(Math.random()).slice(0,42)
    let value = web3.toWei(new BigNumber(0.1), 'ether')
    let tx = buildTx(fullNonce, randomAddr, value, '0x')
    let sigs = createSigs(signers, multisig.address, tx)

    let errMsg = ''
    try {
      await multisig.execute(sigs.sigV, sigs.sigR, sigs.sigS, tx, {from: accounts[0], gasLimit: 1000000})
    }
    catch(error) {
      errMsg = error.message
    }

    assert.equal(errMsg, 'VM Exception while processing transaction: revert', 'Test did not throw')
    done()
  }

  let creationFailure = async function(owners, threshold, done) {
    try {
      await ConclaveMultiSig.new(threshold, owners, {from: accounts[0]})
    }
    catch(error) {
      errMsg = error.message
    }

    assert.equal(errMsg, 'VM Exception while processing transaction: revert', 'Test did not throw')
    done()
  }

  before((done) => {
    let seed = "pull rent tower word science patrol economy legal yellow kit frequent fat"

    lightwallet.keystore.createVault(
    {
      hdPathString: "m/44'/60'/0'/0",
      seedPhrase: seed,
      password: "test",
      salt: "testsalt"
    },
    function (err, keystore) {
      lw = keystore
      lw.keyFromPassword("test", function(e,k) {
        keyFromPw = k

        lw.generateNewAddress(keyFromPw, 20)
        acct = lw.getAddresses()
        acct.sort()
        done()
      })
    })
  })

  describe("3 signers, threshold 2", () => {
    it("should succeed with signers 0, 1", (done) => {
      let signers = [acct[0], acct[1]]
      signers.sort()
      executeSendSuccess(acct.slice(0,3), 2, signers, done)
    })

    it("should succeed with signers 0, 2", (done) => {
      let signers = [acct[0], acct[2]]
      signers.sort()
      executeSendSuccess(acct.slice(0,3), 2, signers, done)
    })

    it("should succeed with signers 1, 2", (done) => {
      let signers = [acct[1], acct[2]]
      signers.sort()
      executeSendSuccess(acct.slice(0,3), 2, signers, done)
    })

    it("should fail due to non-owner signer", (done) => {
      let signers = [acct[0], acct[3]]
      signers.sort()
      executeSendFailure(acct.slice(0,3), 2, signers, done)
    })

    it("should fail with more signers than threshold", (done) => {
      executeSendFailure(acct.slice(0,3), 2, acct.slice(0,3), done)
    })

    it("should fail with fewer signers than threshold", (done) => {
      executeSendFailure(acct.slice(0,3), 2, [acct[0]], done)
    })

    it("should fail with one signer signing twice", (done) => {
      executeSendFailure(acct.slice(0,3), 2, [acct[0], acct[0]], done)
    })

    it("should fail with signers in wrong order", (done) => {
      let signers = [acct[0], acct[1]]
      signers.sort().reverse() //opposite order it should be
      executeSendFailure(acct.slice(0,3), 2, signers, done)
    })

  })

  describe("Edge cases", () => {
    it("should succeed with 10 owners, 10 signers", (done) => {
      executeSendSuccess(acct.slice(0,10), 10, acct.slice(0,10), done)
    })

    it("should fail to create with signers 0, 0, 2, and threshold 3", (done) => {
      creationFailure([acct[0],acct[0],acct[2]], 3, done)
    })

    it("should fail with 0 signers", (done) => {
      executeSendFailure(acct.slice(0,3), 2, [], done)
    })

    it("should fail with 11 owners", (done) => {
      creationFailure(acct.slice(0,11), 2, done)
    })
  })
})
