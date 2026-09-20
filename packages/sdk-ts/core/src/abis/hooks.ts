// Generated from poc-contract compiler artifacts. Run `pnpm contracts:sync` after `forge build`.
export const SPENDING_LIMIT_HOOK_ABI = [
  {
    type: 'function',
    name: 'PERIOD_DAILY',
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
    name: 'PERIOD_HOURLY',
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
    name: 'PERIOD_MONTHLY',
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
    name: 'PERIOD_WEEKLY',
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
    name: 'getConfiguredTokens',
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
    name: 'getRemainingAllowance',
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
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSpendingLimit',
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
        type: 'tuple',
        internalType: 'struct SpendingLimitHook.SpendingLimit',
        components: [
          {
            name: 'allowance',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'limit',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'periodLength',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'periodStart',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'isEnabled',
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
    name: 'getTimeUntilReset',
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
    name: 'postCheck',
    inputs: [
      {
        name: 'hookData',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'preCheck',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: '',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: 'hookData',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'removeSpendingLimit',
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
    name: 'resetPeriod',
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
    name: 'setSpendingLimit',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'limit',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'periodLength',
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
    type: 'event',
    name: 'AccountPaused',
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
    name: 'AccountUnpaused',
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
    name: 'PeriodReset',
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
      {
        name: 'newPeriodStart',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SpendingLimitRemoved',
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
    name: 'SpendingLimitSet',
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
      {
        name: 'limit',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'periodLength',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SpendingRecorded',
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
      {
        name: 'spent',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'remaining',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AccountIsPaused',
    inputs: [],
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
    name: 'InvalidLimit',
    inputs: [],
  },
  {
    type: 'error',
    name: 'LimitNotConfigured',
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
    name: 'SpendingLimitExceeded',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'spent',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'allowance',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
  },
] as const

export const HEALTH_FACTOR_HOOK_ABI = [
  {
    type: 'function',
    name: 'DEFAULT_THRESHOLD',
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
    name: 'MIN_HEALTH_FACTOR',
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
    name: 'addMonitoredTarget',
    inputs: [
      {
        name: 'target',
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
        name: 'minHf',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'enabled',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'initialized',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCurrentHealthFactor',
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
    name: 'getMonitoredTargets',
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
    name: 'isEnabled',
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
    name: 'isMonitoredTarget',
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
    name: 'postCheck',
    inputs: [
      {
        name: 'hookData',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'preCheck',
    inputs: [
      {
        name: 'msgSender',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'msgValue',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'msgData',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: 'hookData',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'removeMonitoredTarget',
    inputs: [
      {
        name: 'target',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setEnabled',
    inputs: [
      {
        name: 'enabled',
        type: 'bool',
        internalType: 'bool',
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
        name: 'threshold',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'EnabledChanged',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'enabled',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'HealthFactorChanged',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'preHealthFactor',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'postHealthFactor',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MinHealthFactorSet',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'threshold',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MonitoredTargetAdded',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'target',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MonitoredTargetRemoved',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'target',
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
    name: 'HealthFactorTooLow',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidMsgData',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidTarget',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidThreshold',
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
    name: 'TargetAlreadyMonitored',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TargetNotMonitored',
    inputs: [],
  },
] as const
