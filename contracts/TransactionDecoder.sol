pragma solidity 0.8.4;

/// @title The transaction decoder implementation
/// @notice Provides a `decodeTransaction` to decode RLP encoded Ethereum transactions. Based on
/// RLPReader code by Andreas Olofsson.
contract TransactionDecoder {
  uint constant DATA_SHORT_START = 0x80;
  uint constant DATA_LONG_START = 0xB8;
  uint constant LIST_SHORT_START = 0xC0;
  uint constant LIST_LONG_START = 0xF8;
  uint constant DATA_LONG_OFFSET = 0xB7;
  uint constant LIST_LONG_OFFSET = 0xF7;

  function decodeTransaction(bytes memory transaction_) internal pure returns (
    uint nonce_, uint gasPrice_, uint gasLimit_, address to_, uint amount_, bytes memory data_
  ) {
    require(transaction_.length > 0);

    uint memStart;
    uint memPtr;
    uint len;

    assembly { memStart := add(transaction_, 0x20) }

    (memPtr, len) = decodeListHeader(memStart);
    require(memPtr - memStart + len == transaction_.length); // check list header matches tx len

    (memPtr, len) = decodeDataHeader(memPtr);
    nonce_ = decodeUint(memPtr, len);

    (memPtr, len) = decodeDataHeader(memPtr + len);
    gasPrice_ = decodeUint(memPtr, len);

    (memPtr, len) = decodeDataHeader(memPtr + len);
    gasLimit_ = decodeUint(memPtr, len);

    (memPtr, len) = decodeDataHeader(memPtr + len);
    to_ = decodeAddress(memPtr, len);

    (memPtr, len) = decodeDataHeader(memPtr + len);
    amount_ = decodeUint(memPtr, len);

    (memPtr, len) = decodeDataHeader(memPtr + len);

    // ATENTION: The following will use the `transaction_` memory space to build the data byte
    // array. This will mutate the `transaction_` array so DONT USE IT AFTER THIS!.

    assembly {
      data_ := sub(memPtr, 0x20)
      mstore(data_, len)
    }

    // Ignore v, r, s components for now.
  }

  function decodeListHeader(uint memPtr_) private pure returns (uint ptr, uint len) {
    uint b0;
    assembly { b0 := byte(0, mload(memPtr_)) }

    if (b0 >= LIST_LONG_START) {
      assembly {
        let bLen := sub(b0, 0xF7) // bytes length (LIST_LONG_OFFSET)
        len := div(mload(add(memPtr_, 1)), exp(256, sub(32, bLen))) // data length
        ptr := add(1, add(memPtr_, bLen)) // offset
      }
    } else if (b0 >= LIST_SHORT_START) {
      len = b0 - LIST_SHORT_START;
      ptr = memPtr_ + 1;
    } else {
      revert();
    }
  }

  function decodeDataHeader(uint memPtr_) private pure returns (uint ptr, uint len) {
    uint b0;
    assembly { b0 := byte(0, mload(memPtr_)) }

    if (b0 < DATA_SHORT_START) {
      len = 1;
      ptr = memPtr_;
    } else if(b0 < DATA_LONG_START) {
      len = b0 - DATA_SHORT_START;
      ptr = memPtr_ + 1;
    } else if (b0 < LIST_SHORT_START) {
      assembly {
        let bLen := sub(b0, 0xB7) // bytes length (DATA_LONG_OFFSET)
        len := div(mload(add(memPtr_, 1)), exp(256, sub(32, bLen))) // data length
        ptr := add(1, add(memPtr_, bLen)) // offset
      }
    } else {
      revert();
    }
  }

  function decodeUint(uint memPtr_, uint len_) private pure returns (uint out) {
    if(len_ == 0) return 0; // null ints are interpreted as 0
    require(len_ <= 32);
    assembly { out := div(mload(memPtr_), exp(256, sub(32, len_))) }
  }

  function decodeAddress(uint memPtr_, uint len_) private pure returns (address out) {
    require(len_ == 20); // null addresses are not supported yet
    assembly { out := div(mload(memPtr_), exp(256, 12)) }
  }
}
