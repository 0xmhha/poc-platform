// Generated from poc-contract compiler artifacts. Run `pnpm contracts:sync` after `forge build`.
export const MERCHANT_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'DEFAULT_FEE_BPS',
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
    name: 'MAX_FEE_BPS',
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
    name: 'addVerifier',
    inputs: [
      {
        name: 'verifier',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getMerchantFee',
    inputs: [
      {
        name: 'merchant',
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
    name: 'getMerchantInfo',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'name',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'website',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'email',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'isVerified',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'isSuspended',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'registeredAt',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTotalMerchants',
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
    name: 'getVerifiedMerchants',
    inputs: [],
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
    name: 'getVerifiers',
    inputs: [],
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
    name: 'isMerchantActive',
    inputs: [
      {
        name: 'merchant',
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
    name: 'isMerchantRegistered',
    inputs: [
      {
        name: 'merchant',
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
    name: 'isMerchantSuspended',
    inputs: [
      {
        name: 'merchant',
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
    name: 'isMerchantVerified',
    inputs: [
      {
        name: 'merchant',
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
    name: 'isVerifier',
    inputs: [
      {
        name: 'verifier',
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
    name: 'merchantList',
    inputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
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
    type: 'function',
    name: 'merchants',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'name',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'website',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'email',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'isRegistered',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'isVerified',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'isSuspended',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'registeredAt',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'verifiedAt',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'verifiedBy',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'customFeeBps',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
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
    name: 'registerMerchant',
    inputs: [
      {
        name: 'name',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'website',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'email',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeVerifier',
    inputs: [
      {
        name: 'verifier',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revokeVerification',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setMerchantFee',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'feeBps',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'suspendMerchant',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [
      {
        name: 'newOwner',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unsuspendMerchant',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateMerchantInfo',
    inputs: [
      {
        name: 'name',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'website',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'email',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'verifiedMerchantList',
    inputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
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
    type: 'function',
    name: 'verifierList',
    inputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
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
    type: 'function',
    name: 'verifiers',
    inputs: [
      {
        name: '',
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
    name: 'verifyMerchant',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'MerchantFeeUpdated',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'feeBps',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MerchantRegistered',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'name',
        type: 'string',
        indexed: false,
        internalType: 'string',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MerchantSuspended',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MerchantUnsuspended',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MerchantUpdated',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'name',
        type: 'string',
        indexed: false,
        internalType: 'string',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MerchantVerified',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'verifier',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'VerificationRevoked',
    inputs: [
      {
        name: 'merchant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'revoker',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'VerifierAdded',
    inputs: [
      {
        name: 'verifier',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'VerifierRemoved',
    inputs: [
      {
        name: 'verifier',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AlreadyRegistered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'AlreadySuspended',
    inputs: [],
  },
  {
    type: 'error',
    name: 'AlreadyVerified',
    inputs: [],
  },
  {
    type: 'error',
    name: 'AlreadyVerifier',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FeeTooHigh',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidMerchantData',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotRegistered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotSuspended',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotVerified',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotVerifier',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OwnableInvalidOwner',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
] as const
