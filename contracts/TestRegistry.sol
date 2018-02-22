pragma solidity ^0.4.15;

// This contract is only used for testing purposes.
contract TestRegistry {
  event FooBar(bytes data);

  mapping(address => uint) public registry;

  function register(uint x) payable {
    registry[msg.sender] = x;
  }

  function burn(bytes data) payable {
    FooBar(data);
  }

  function fail() payable {
    require(false);
  }
}
