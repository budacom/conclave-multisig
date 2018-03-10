pragma solidity 0.4.15;

import "./TransactionDecoder.sol";

contract BaseMultiSig is TransactionDecoder {
  uint nonce = 1;                           // (only) mutable state
  mapping (address => bool) public isOwner; // immutable state once activated
  uint8 public threshold;                   // immutable state once activated

  // MODIFIERS

  modifier onlySelf() {
    require(msg.sender == address(this));
    _;
  }

  modifier onlyInactive() {
    require(threshold == 0);
    _;
  }

  modifier onlyActive() {
    require(threshold > 0);
    _;
  }

  // PUBLIC METHODS

  /// @return The nonce to be used in the next transaction
  /// @dev This nonce uses the contract address as starting value, this is to provide both replay
  /// protection and to prevent transaction to be sent to a different contract with same owners.
  function fullNonce() constant returns (uint) {
    return uint(this) * 0x100000000 + nonce;
  }

  /// @notice This method can be called to suicide the contract. Can only be called via `execute`.
  function recycle(address _target) onlySelf {
    suicide(_target);
  }

  function () payable {}

  // INTERNAL METHODS

  function setup(uint8 threshold_, address[] owners_) internal {
    require(owners_.length <= 10 && threshold_ <= owners_.length && threshold_ != 0);

    address lastAdd = address(0);
    for (uint i = 0; i < owners_.length; i++) {
      require(owners_[i] > lastAdd);
      isOwner[owners_[i]] = true;
      lastAdd = owners_[i];
    }

    threshold = threshold_;
  }

  function validateSignatures(uint8[] sigV_, bytes32[] sigR_, bytes32[] sigS_, bytes tx_) internal {
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
}
