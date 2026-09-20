// Generated from poc-contract compiler artifacts. Run `pnpm contracts:sync` after `forge build`.
export const MODULE_INTERFACE_ABI = [
  {
    type: 'function',
    name: 'isInitialized',
    inputs: [
      {
        name: 'smartAccount',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isModuleType',
    inputs: [
      {
        name: 'moduleTypeId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'onInstall',
    inputs: [
      {
        name: 'data',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'onUninstall',
    inputs: [
      {
        name: 'data',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'error',
    name: 'AlreadyInitialized',
    inputs: [
      {
        name: 'smartAccount',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotInitialized',
    inputs: [
      {
        name: 'smartAccount',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
] as const
