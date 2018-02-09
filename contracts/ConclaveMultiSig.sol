pragma solidity 0.4.15;

import "./RLP.sol";

contract ConclaveMultiSig {
  using RLP for RLP.RLPItem;
  using RLP for RLP.Iterator;
  using RLP for bytes;

  uint public nonce = 1;             // (only) mutable state
  uint public threshold;             // immutable state
  mapping (address => bool) isOwner; // immutable state
  address[] public ownersArr;        // immutable state

  function ConclaveMultiSig(uint threshold_, address[] owners_) {
    require(owners_.length <= 10 && threshold_ <= owners_.length && threshold_ != 0);

    address lastAdd = address(0);
    for (uint i=0; i<owners_.length; i++) {
      require(owners_[i] > lastAdd);
      isOwner[owners_[i]] = true;
      lastAdd = owners_[i];
    }
    ownersArr = owners_;
    threshold = threshold_;
  }

  function getFullNonce() constant returns (uint) {
    return nonce + uint(this);
  }

  function execute(uint8[] sigV, bytes32[] sigR, bytes32[] sigS, bytes transaction) {
    require(sigR.length == threshold);
    require(sigR.length == sigS.length && sigR.length == sigV.length);

    // validate signatures

    bytes32 txHash = keccak256(transaction);
    address lastAdd = address(0); // cannot have address(0) as an owner
    for (uint i = 0; i < threshold; i++) {
      address recovered = ecrecover(txHash, sigV[i], sigR[i], sigS[i]);
      require(recovered > lastAdd && isOwner[recovered]);
      lastAdd = recovered;
    }

    // parse RLP encoded transaction

    var mTransaction = transaction.toRLPItem(true);
    if (!mTransaction.isList() || mTransaction.items() < 6) revert();

    var itrParts = mTransaction.iterator();
    if(itrParts.next().toUint() != getFullNonce()) revert(); // check nonce
    itrParts.next(); // ignore gas price

    uint gasLimit = itrParts.next().toUint();
    address to = itrParts.next().toAddress();
    uint amount = itrParts.next().toUint();
    bytes memory data = itrParts.next().toData();

    nonce = nonce + 1;

    require(to.call.gas(gasLimit).value(amount)(data));
  }

  function () payable {}
}
