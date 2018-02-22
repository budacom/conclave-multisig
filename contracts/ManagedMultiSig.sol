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

  function activationGas(uint threshold_) returns (uint) {
    return 962089 + (threshold_ * 22208);
  }

  // This method estimates manager refund gas (except for the 'call' call, that is measured)
  //
  // It does a pretty good job for no/small data calls.
  // For large data calls it probably underestimates, more tests are needed.
  //
  function baseGas(uint dataLength_) returns (uint) {
    return 47800 + (uint(threshold) * 9500) + dataLength_ * 33;
  }

  function activate(uint8 threshold_, address[] owners_) onlyManager onlyInactive {
    setup(threshold_, owners_);

    manager.send(activationGas(uint(threshold_)) * tx.gasprice);
  }

  function setManager(address manager_) onlySelf {
    manager = manager_;
  }

  function execute(uint8[] sigV_, bytes32[] sigR_, bytes32[] sigS_, bytes tx_) onlyActive {
    validateSignatures(sigV_, sigR_, sigS_, tx_);

    var (nn, gp, gl, to, am, dt) = decodeTransaction(tx_);

    require(nn == fullNonce()); // check nonce
    require(gp == tx.gasprice); // check gas price to prevent front running attacks

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
