// Generated from poc-contract compiler artifacts. Run `pnpm contracts:sync` after `forge build`.
export const ACCOUNT_CONFIG_ABI = [
  {
    type: 'function',
    name: 'accountId',
    inputs: [],
    outputs: [
      {
        name: 'accountImplementationId',
        type: 'string',
        internalType: 'string',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'supportsExecutionMode',
    inputs: [
      {
        name: 'mode',
        type: 'bytes32',
        internalType: 'ExecMode',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'supportsModule',
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
    stateMutability: 'pure',
  },
] as const
