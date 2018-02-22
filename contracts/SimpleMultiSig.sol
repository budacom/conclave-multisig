pragma solidity 0.4.15;

import "./BaseMultiSig.sol";

contract SimpleMultiSig is BaseMultiSig {
  function SimpleMultiSig(uint8 threshold_, address[] owners_) {
    setup(threshold_, owners_);
  }

  function execute(uint8[] sigV_, bytes32[] sigR_, bytes32[] sigS_, bytes tx_) onlyActive { // ~ 3.5k gas
    validateSignatures(sigV_, sigR_, sigS_, tx_); // ~ 11k gas

    var (nn, gp, gl, to, am, dt) = decodeTransaction(tx_); // ~ 3.5k gas

    require(nn == fullNonce()); // check nonce
    require(gp == tx.gasprice); // check gas price

    nonce = nonce + 1;

    require(to.call.gas(gl).value(am)(dt));
  }
}
