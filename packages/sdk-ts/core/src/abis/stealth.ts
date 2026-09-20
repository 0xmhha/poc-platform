// Generated from poc-contract compiler artifacts. Run `pnpm contracts:sync` after `forge build`.
export const ERC5564_ANNOUNCER_ABI = [
  {
    type: 'function',
    name: 'announce',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'stealthAddress',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'ephemeralPubKey',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: 'metadata',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'announceAndTransfer',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'stealthAddress',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'ephemeralPubKey',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: 'metadata',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'announceBatch',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'stealthAddresses',
        type: 'address[]',
        internalType: 'address[]',
      },
      {
        name: 'ephemeralPubKeys',
        type: 'bytes[]',
        internalType: 'bytes[]',
      },
      {
        name: 'metadatas',
        type: 'bytes[]',
        internalType: 'bytes[]',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'announcementsByScheme',
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
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'encodeMetadata',
    inputs: [
      {
        name: 'viewTag',
        type: 'bytes1',
        internalType: 'bytes1',
      },
      {
        name: 'data',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: 'metadata',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'enforceSchemeValidation',
    inputs: [],
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
    name: 'generateViewTag',
    inputs: [
      {
        name: 'stealthAddress',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes1',
        internalType: 'bytes1',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'getStats',
    inputs: [],
    outputs: [
      {
        name: 'total',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'secp256k1Count',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'secp256r1Count',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isSchemeSupported',
    inputs: [
      {
        name: 'schemeId',
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
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setEnforceSchemeValidation',
    inputs: [
      {
        name: 'enforce',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setSchemeSupport',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'supported',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'description',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'supportedSchemes',
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
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalAnnouncements',
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
    type: 'event',
    name: 'Announcement',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'stealthAddress',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'caller',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'ephemeralPubKey',
        type: 'bytes',
        indexed: false,
        internalType: 'bytes',
      },
      {
        name: 'metadata',
        type: 'bytes',
        indexed: false,
        internalType: 'bytes',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'BatchAnnouncement',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'caller',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'count',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
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
    name: 'SchemeRegistered',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'description',
        type: 'string',
        indexed: false,
        internalType: 'string',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'InvalidEphemeralPubKey',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidStealthAddress',
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
  {
    type: 'error',
    name: 'UnsupportedScheme',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
  },
] as const

export const ERC6538_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'DOMAIN_SEPARATOR',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ERC6538REGISTRY_ENTRY_TYPE_HASH',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getStealthMetaAddress',
    inputs: [
      {
        name: 'registrant',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasRegisteredKeys',
    inputs: [
      {
        name: 'registrant',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'schemeId',
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
    name: 'incrementNonce',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'nonceOf',
    inputs: [
      {
        name: 'registrant',
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
    name: 'parseStealthMetaAddress',
    inputs: [
      {
        name: 'stealthMetaAddress',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: 'spendingPubKey',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: 'viewingPubKey',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'registerKeys',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'stealthMetaAddress',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerKeysOnBehalf',
    inputs: [
      {
        name: 'registrant',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'signature',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: 'stealthMetaAddress',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeKeys',
    inputs: [
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'stealthMetaAddressOf',
    inputs: [
      {
        name: 'registrant',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'schemeId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'NonceIncremented',
    inputs: [
      {
        name: 'registrant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newNonce',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'StealthMetaAddressRemoved',
    inputs: [
      {
        name: 'registrant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'schemeId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'StealthMetaAddressSet',
    inputs: [
      {
        name: 'registrant',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'schemeId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'stealthMetaAddress',
        type: 'bytes',
        indexed: false,
        internalType: 'bytes',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'ECDSAInvalidSignature',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ECDSAInvalidSignatureLength',
    inputs: [
      {
        name: 'length',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'ECDSAInvalidSignatureS',
    inputs: [
      {
        name: 's',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
  },
  {
    type: 'error',
    name: 'ERC6538Registry__InvalidSignature',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidStealthMetaAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'KeysNotRegistered',
    inputs: [],
  },
] as const
