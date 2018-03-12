pragma solidity 0.4.15;

import "./TransactionDecoder.sol";

/// @title An RLP encoded transaction version of the SimpleMultiSig contract by Christian Lundkvist.
/// @author Ignacio Baixas (ignacio0buda.com)
contract SimpleMultiSig is TransactionDecoder {
  uint nonce = 1;                           // (only) mutable state
  mapping (address => bool) public isOwner; // immutable state once activated
  uint8 public threshold;                   // immutable state once activated

  // MODIFIERS

  modifier onlySelf() {
    require(msg.sender == address(this));
    _;
  }

  /// @param threshold_ The multisig signature threshold
  /// @param owners_ The wallet allowed signers adresses, in ascending order.
  function SimpleMultiSig(uint8 threshold_, address[] owners_) {
    require(owners_.length <= 10 && threshold_ <= owners_.length && threshold_ != 0);

    address lastAdd = address(0);
    for (uint i = 0; i < owners_.length; i++) {
      require(owners_[i] > lastAdd);
      isOwner[owners_[i]] = true;
      lastAdd = owners_[i];
    }

    threshold = threshold_;
  }

  /// @return The nonce to be used in the next transaction
  /// @dev This nonce uses the contract address as starting value, this is to provide both replay
  /// protection and to prevent transaction to be sent to a different contract with same owners.
  function fullNonce() constant returns (uint) {
    return uint(this) * 0x100000000 + nonce;
  }

  /// @notice Executes a signed transaction. The signatures must be passed in the same order as
  /// their corresponding signers address ordered in an ascending manner.
  /// @param sigV_ The signatures V parts
  /// @param sigR_ The signatures R parts
  /// @param sigS_ The signatures S parts
  /// @param tx_ A RLP encoded standard ethereum transaction (as generated by most client)
  function execute(uint8[] sigV_, bytes32[] sigR_, bytes32[] sigS_, bytes tx_) { // ~ 3.5k gas
    validateSignatures(sigV_, sigR_, sigS_, tx_); // ~ 11k gas

    var (nn, gp, gl, to, am, dt) = decodeTransaction(tx_); // ~ 3.5k gas

    require(nn == fullNonce()); // check nonce
    require(gp == tx.gasprice); // check gas price
    require(canCall(to));

    nonce = nonce + 1;

    require(to.call.gas(gl).value(am)(dt));
  }

  function () payable {}

  /// @notice This method can be called to suicide the contract. Can only be called via `execute`.
  function recycle(address _target) onlySelf {
    suicide(_target);
  }

  // PRIVATE METHODS

  /// @dev validates ordered signatures
  function validateSignatures(uint8[] sigV_, bytes32[] sigR_, bytes32[] sigS_, bytes tx_) private {
    require(sigR_.length == threshold);
    require(sigR_.length == sigS_.length && sigR_.length == sigV_.length);

    bytes32 txHash = keccak256(tx_);
    address lastAdd = address(0); // cannot have address(0) as an owner
    for (uint i = 0; i < threshold; i++) {
      // only v 27-28 signatures are supported:
      address recovered = ecrecover(txHash, sigV_[i], sigR_[i], sigS_[i]);
      require(recovered > lastAdd && isOwner[recovered]);
      lastAdd = recovered;
    }
  }

  /// @dev this method can be overriden by child contracts to implement custom policies
  function canCall(address _) private returns (bool) {
    return true;
  }
}
