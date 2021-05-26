pragma solidity 0.8.4;

// This contract is only used for testing purposes.
contract TestRegistry {
  event FooBar(bytes data);

  mapping(address => uint) public registry;

  function register(uint x) external payable {
    registry[msg.sender] = x;
  }

  function burn(bytes calldata data) external payable {
    emit FooBar(data);
  }

  function fail() external payable {
    require(false);
  }
}
