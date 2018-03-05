pragma solidity 0.4.15;

import "./ManagedMultiSig.sol";

/// @title A whitelist-enabled version of the ManagedMultiSig
/// @author ignacio@buda.com
contract ManagedWhitelistedMultiSig is ManagedMultiSig {
  mapping (address => bool) whitelist;  // the whitelisted addresses mapping

  /// @notice Check if a given address is whitelisted by this wallet
  /// @dev contract address and owners are always whitelisted
  /// @param address_ The address to check
  /// @return true if address is whitelisted, false if not
  function isWhitelisted(address address_) public constant returns (bool) {
    return address_ == address(this) || isOwner[address_] || whitelist[address_];
  }

  /// @notice Sets the whitelist status for an address
  /// @dev this method can only be called by the contract it self (via an execute call)
  /// @param address_ The address status to set
  /// @param whitelisted_ true to add address to whitelist, false to remove it
  function setWhitelisted(address address_, bool whitelisted_) onlySelf {
    whitelist[address_] = whitelisted_;
  }

  // PRIVATE METHODS

  /// @dev Override base refund gas, a little more gas is required for the whitelist validation
  function baseGas(uint dataLength_) private returns (uint) {
    return 48800 + (uint(threshold) * 9500) + dataLength_ * 33;
  }

  /// @dev Just forward call to isWhitelisted
  function canCall(address address_) private returns (bool) {
    return isWhitelisted(address_);
  }
}
