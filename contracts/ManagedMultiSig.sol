pragma solidity 0.4.15;

import "./BaseMultiSig.sol";

contract ManagedMultiSig is BaseMultiSig {
  uint constant PRE_TX_GAS = 45000; // 25000 (if new) + 9700 (if value) + 9731 (refund)

  event Result(bool succeeded, uint fee);
  // event Debug(uint gas);

  address public manager;

  function ManagedMultiSig() {
    manager = msg.sender;
  }

  function activate(uint8 threshold_, address[] owners_, uint fee_) onlyManager onlyInactive {
    setup(threshold_, owners_);

    manager.send(fee_ > this.balance ? this.balance : fee_);
  }

  function execute(uint8[] sigV_, bytes32[] sigR_, bytes32[] sigS_, bytes tx_) onlyActive {
    validateSignatures(sigV_, sigR_, sigS_, tx_);

    var (nn, gp, gl, to, am, dt) = decodeTransaction(tx_);

    require(nn == fullNonce()); // check nonce
    require(gp == tx.gasprice); // check gas price to prevent front running attacks
    require(canCall(to));

    nonce = nonce + 1;

    if(msg.sender == manager) {
      uint beforeCallGas = msg.gas;
      require(beforeCallGas > (gl + PRE_TX_GAS)); // ensure there is enough gas for the user limit

      Result(
        to.call.gas(gl).value(am)(dt),
        payManager(baseGas(dt.length) + (beforeCallGas - msg.gas))
      );
    } else {
      require(to.call.gas(gl).value(am)(dt));
    }
  }

  // PRIVATE METHODS

  function baseGas(uint dataLength_) private returns (uint) {
    return 47800 + (uint(threshold) * 9500) + dataLength_ * 33;
  }

  // The can call method can be overriden by child contracts to implement custom policies
  function canCall(address _) private returns (bool) {
    return true;
  }

  function payManager(uint totalGas_) private returns (uint) {
    uint fee = totalGas_ * tx.gasprice;
    if (fee > this.balance) fee = this.balance;

    return manager.send(fee) ? fee : 0;
  }

  // MODIFIERS

  modifier onlyManager() {
    require(msg.sender == manager);
    _;
  }
}
