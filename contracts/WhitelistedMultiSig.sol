pragma solidity 0.4.15;

import "./SimpleMultiSig.sol";

/// @title A whitelist-enabled version of the SimpleMultiSig
/// @author Ignacio Baixas (ignacio0buda.com)
contract WhitelistedMultiSig is SimpleMultiSig {
  mapping (address => bool) whitelist;  // the whitelisted addresses mapping

  /// @param threshold_ The multisig signature threshold
  /// @param owners_ The wallet allowed signers adresses, in ascending order.
  function WhitelistedMultiSig(uint8 threshold_, address[] owners_) SimpleMultiSig(threshold_, owners_) {
    // nothing extra here
  }

  /// @notice Check if a given address is whitelisted by this wallet
  /// @dev contract address and owners are always whitelisted
  /// @param address_ The address to check
  /// @return true if address is whitelisted, false if not
  function isWhitelisted(address address_) public constant returns (bool) {
    return address_ == address(this) || isOwner[address_] || whitelist[address_];
  }

  /// @notice Sets the whitelist status for an address. Can only be called via `execute`.
  /// @param address_ The address status to set
  /// @param whitelisted_ true to add address to whitelist, false to remove it
  function setWhitelisted(address address_, bool whitelisted_) onlySelf {
    whitelist[address_] = whitelisted_;
  }

  // PRIVATE METHODS

  /// @dev Just forward call to isWhitelisted
  function canCall(address address_) private returns (bool) {
    return isWhitelisted(address_);
  }
}
