// Generated from poc-contract compiler artifacts. Run `pnpm contracts:sync` after `forge build`.
export const KERNEL_FACTORY_ABI = [
  {
    type: 'function',
    name: 'ENTRYPOINT',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IEntryPoint',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'IMPLEMENTATION',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'createAccount',
    inputs: [
      {
        name: 'data',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: 'salt',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getAddress',
    inputs: [
      {
        name: 'data',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: 'salt',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'error',
    name: 'ImplementationNotDeployed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InitializeError',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotCalledFromEntryPoint',
    inputs: [],
  },
] as const
