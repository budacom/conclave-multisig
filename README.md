# conclave-multisig

Simple multisig contract that uses standard RLP encoded ethereum transactions plus detached signatures.

Based on the [The Simple Multisig](https://github.com/christianlundkvist/simple-multisig) by Christian Lundkvist.

Transaction decoding code was taken from the [RLP lib](https://github.com/Giveth/milestonetracker/blob/master/contracts/RLP.sol) by the Giveth team.

## Motivation

When using a hardware wallet like trezor, having the ability to review information on-device when signing a transaction is crucial. This is specially true when transaction is being assembled and broadcasted by a third party like Conclave.

When using non-standard transactions (like a custom contract payload), the user has to sign a message for which the HW has no native support, this means that the HW will show the user a long string of hashed garbage and it will be really dificult for the user to be sure of what he is signing is the transaction the site is telling him he is signing.

By using this contract and signing standard transactions, the HW is capable of displaying the transaction information as in any regular transaction, making it very clear to the user. The user only needs to confirm that the contract processing the transaction is an instance of `ConclaveMultiSig` (by checking the deployed code at the contract address).

## Caveats

**nonce**: This contract uses the transaction `nonce` as a way of checking that the transaction can only be sent to the requested contract and to prevent replay attacks. For this the contract keeps a `nonce` state variable that increments on every successfull transaction (as in the original Simple Multisig Contract). The difference is that when checking the transaction nonce it checks against `contract address * 0x1000000 + nonce` (not only against nonce).

**gas usage**: For 2 of 3 multisig, a simple transaction to an already initialized address will cost around 63k gas. Also, contract deployment will cost around 800k gas.

**different chain replay protection**: This contract has no replay protection for the signed transaction on a different chain. In case of a fork, transactions sent to this contract could be sent to the forked contract also. The only way to get this kind of security would be to have access to the chain id from inside the contract.

## Extras

### The `WhitelistedMultiSig`

The `WhitelistedMultiSig` implementation builds on top the `SimpleMultiSig` and adds address whitelisting.

## Testing

To run the tests:

* Make sure `ganache-cli` is running using `ganache-cli -p 8545`.
* `npm install`
* `npm run test `
