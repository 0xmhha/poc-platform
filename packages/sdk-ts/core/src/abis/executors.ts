// Generated from poc-contract compiler artifacts. Run `pnpm contracts:sync` after `forge build`.
export const SESSION_KEY_EXECUTOR_ABI = [
  {
    type: 'function',
    name: 'addSessionKey',
    inputs: [
      {
        name: 'sessionKey',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'validAfter',
        type: 'uint48',
        internalType: 'uint48',
      },
      {
        name: 'validUntil',
        type: 'uint48',
        internalType: 'uint48',
      },
      {
        name: 'spendingLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'executeAsSessionKey',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'target',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'data',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes[]',
        internalType: 'bytes[]',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'executeOnBehalf',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'target',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'data',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: 'nonce',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'signature',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes[]',
        internalType: 'bytes[]',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getActiveSessionKeys',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address[]',
        internalType: 'address[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPermissions',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'sessionKey',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'result',
        type: 'tuple[]',
        internalType: 'struct SessionKeyExecutor.Permission[]',
        components: [
          {
            name: 'target',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'selector',
            type: 'bytes4',
            internalType: 'bytes4',
          },
          {
            name: 'maxValue',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'allowed',
            type: 'bool',
            internalType: 'bool',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getRemainingSpendingLimit',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'sessionKey',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSessionKey',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'sessionKey',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct SessionKeyExecutor.SessionKeyConfig',
        components: [
          {
            name: 'sessionKey',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'validAfter',
            type: 'uint48',
            internalType: 'uint48',
          },
          {
            name: 'validUntil',
            type: 'uint48',
            internalType: 'uint48',
          },
          {
            name: 'spendingLimit',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'spentAmount',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'nonce',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'isActive',
            type: 'bool',
            internalType: 'bool',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'grantPermission',
    inputs: [
      {
        name: 'sessionKey',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'target',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'selector',
        type: 'bytes4',
        internalType: 'bytes4',
      },
      {
        name: 'maxValue',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'hasPermission',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'sessionKey',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'target',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'selector',
        type: 'bytes4',
        internalType: 'bytes4',
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
    stateMutability: 'pure',
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
        name: '',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'revokePermission',
    inputs: [
      {
        name: 'sessionKey',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'target',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'selector',
        type: 'bytes4',
        internalType: 'bytes4',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revokeSessionKey',
    inputs: [
      {
        name: 'sessionKey',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'PermissionGranted',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'sessionKey',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'target',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'selector',
        type: 'bytes4',
        indexed: false,
        internalType: 'bytes4',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PermissionRevoked',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'sessionKey',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'target',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'selector',
        type: 'bytes4',
        indexed: false,
        internalType: 'bytes4',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SessionKeyAdded',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'sessionKey',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'validAfter',
        type: 'uint48',
        indexed: false,
        internalType: 'uint48',
      },
      {
        name: 'validUntil',
        type: 'uint48',
        indexed: false,
        internalType: 'uint48',
      },
      {
        name: 'spendingLimit',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SessionKeyExecuted',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'sessionKey',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'target',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'selector',
        type: 'bytes4',
        indexed: false,
        internalType: 'bytes4',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SessionKeyRevoked',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'sessionKey',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
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
    name: 'InvalidNonce',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidSessionKey',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidSignature',
    inputs: [],
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
  {
    type: 'error',
    name: 'PermissionDenied',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SessionKeyAlreadyExists',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SessionKeyExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SessionKeyNotActive',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SessionKeyNotYetValid',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpendingLimitExceeded',
    inputs: [],
  },
] as const

export const SWAP_EXECUTOR_ABI = [
  {
    type: 'function',
    name: 'QUOTER',
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
    name: 'SWAP_ROUTER',
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
    name: 'addWhitelistedToken',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'calculateMinOutput',
    inputs: [
      {
        name: 'expectedOutput',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'slippageBps',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'getAccountConfig',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'dailyLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'perSwapLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'dailyUsed',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'lastResetTime',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'isActive',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDailyUsage',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLimits',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'dailyLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'perSwapLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getQuoter',
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
    name: 'getSwapRouter',
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
    name: 'getWhitelistedTokens',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address[]',
        internalType: 'address[]',
      },
    ],
    stateMutability: 'view',
  },
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
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'isPaused',
    inputs: [
      {
        name: 'account',
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
    name: 'isTokenWhitelisted',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'token',
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
        name: '',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'pause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeWhitelistedToken',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setLimits',
    inputs: [
      {
        name: 'dailyLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'perSwapLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'swapExactInput',
    inputs: [
      {
        name: 'path',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: 'amountIn',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'amountOutMinimum',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'deadline',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'amountOut',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'swapExactInputSingle',
    inputs: [
      {
        name: 'tokenIn',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'tokenOut',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'fee',
        type: 'uint24',
        internalType: 'uint24',
      },
      {
        name: 'amountIn',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'amountOutMinimum',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'deadline',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'amountOut',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'LimitsUpdated',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'dailyLimit',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'perSwapLimit',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Paused',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SwapExecuted',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'tokenIn',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'tokenOut',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amountIn',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'amountOut',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TokenRemovedFromWhitelist',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'token',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TokenWhitelisted',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'token',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Unpaused',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
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
    name: 'DeadlineExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ExceedsDailyLimit',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ExceedsPerSwapLimit',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAmount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidLimits',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidPath',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidToken',
    inputs: [],
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
  {
    type: 'error',
    name: 'SlippageTooHigh',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SwapFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SwapsPaused',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TokenAlreadyWhitelisted',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TokenNotWhitelisted',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
] as const

export const LENDING_EXECUTOR_ABI = [
  {
    type: 'function',
    name: 'LENDING_POOL',
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
    name: 'MIN_HEALTH_FACTOR_THRESHOLD',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'addAllowedAsset',
    inputs: [
      {
        name: 'asset',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'borrow',
    inputs: [
      {
        name: 'asset',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAccountConfig',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'minHealthFactor',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'maxBorrowLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'totalBorrowed',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'isActive',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAllowedAssets',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address[]',
        internalType: 'address[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBorrowedAmount',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'asset',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLendingPool',
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
    name: 'getMaxBorrowLimit',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMinHealthFactor',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSuppliedAmount',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'asset',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isAssetAllowed',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'asset',
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
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'isPaused',
    inputs: [
      {
        name: 'account',
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
        name: '',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'pause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeAllowedAsset',
    inputs: [
      {
        name: 'asset',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'repay',
    inputs: [
      {
        name: 'asset',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setMaxBorrowLimit',
    inputs: [
      {
        name: 'maxBorrowLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setMinHealthFactor',
    inputs: [
      {
        name: 'minHealthFactor',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'supply',
    inputs: [
      {
        name: 'asset',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      {
        name: 'asset',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'AssetAllowed',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'asset',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'AssetRemoved',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'asset',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Borrowed',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'asset',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ConfigUpdated',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'minHealthFactor',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'maxBorrowLimit',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Paused',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Repaid',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'asset',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Supplied',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'asset',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Unpaused',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'asset',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
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
    name: 'AssetAlreadyAllowed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'AssetNotAllowed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ExceedsBorrowLimit',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAmount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAsset',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidHealthFactor',
    inputs: [],
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
  {
    type: 'error',
    name: 'OperationFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OperationsPaused',
    inputs: [],
  },
] as const

export const STAKING_EXECUTOR_ABI = [
  {
    type: 'function',
    name: 'DEFAULT_DAILY_LIMIT',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'DEFAULT_MAX_STAKE',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'addAllowedPool',
    inputs: [
      {
        name: 'pool',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimRewards',
    inputs: [
      {
        name: 'pool',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'compoundRewards',
    inputs: [
      {
        name: 'pool',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAccountConfig',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'maxStakePerPool',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'dailyStakeLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'dailyUsed',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'isActive',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'isPaused',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAllowedPools',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address[]',
        internalType: 'address[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDailyUsed',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPendingRewards',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'pool',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getStakedAmount',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'pool',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
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
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'isPoolAllowed',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'pool',
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
    type: 'function',
    name: 'removeAllowedPool',
    inputs: [
      {
        name: 'pool',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setDailyStakeLimit',
    inputs: [
      {
        name: 'dailyLimit',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setMaxStakePerPool',
    inputs: [
      {
        name: 'maxStake',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setPaused',
    inputs: [
      {
        name: 'paused',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'stake',
    inputs: [
      {
        name: 'pool',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'stakeWithLock',
    inputs: [
      {
        name: 'pool',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'lockDuration',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unstake',
    inputs: [
      {
        name: 'pool',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'ConfigUpdated',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'maxStake',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'dailyLimit',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ExecutorPausedEvent',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'isPaused',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PoolAllowed',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'pool',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PoolRemoved',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'pool',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RewardsClaimed',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'pool',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RewardsCompounded',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'pool',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Staked',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'pool',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Unstaked',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'pool',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
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
    name: 'ExceedsDailyLimit',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ExceedsMaxStake',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ExecutorPaused',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAmount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidPool',
    inputs: [],
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
  {
    type: 'error',
    name: 'PoolAlreadyAllowed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'PoolNotAllowed',
    inputs: [],
  },
] as const
