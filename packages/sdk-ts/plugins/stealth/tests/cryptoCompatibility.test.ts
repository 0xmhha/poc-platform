import type { Hex } from 'viem'
import { verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import {
  checkViewTag,
  computeStealthPrivateKey,
  derivePublicKey,
  generateStealthAddressCrypto,
} from '../src'

// Captured from the pre-upgrade noble-curves 1.9.7 implementation.
// These are public test keys, including scalars near the curve order.
const vectors = [
  {
    spendingPrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    viewingPrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000002',
    ephemeralPrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000003',
    spendingPubKey: '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    viewingPubKey: '0x02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
    ephemeralPubKey: '0x02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
    ephemeralUncompressedPubKey:
      '0x04f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9388f7b0f632de8140fe337e62a37f3566500a99934c2231b6cb9fd7584b8e672',
    viewTag: '0xcd',
    stealthAddress: '0x7f7d3Bae345AE700dCdA65D1b1f98F43835a17c4',
    stealthPrivateKey: '0xcd36b55d26196fc0b96312b01dd978fc5e380c8afeab49aae283f0ca6a814ff5',
  },
  {
    spendingPrivateKey: '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140',
    viewingPrivateKey: '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd036413f',
    ephemeralPrivateKey: '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd036413e',
    spendingPubKey: '0x0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    viewingPubKey: '0x03c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
    ephemeralPubKey: '0x03f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
    ephemeralUncompressedPubKey:
      '0x04f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9c77084f09cd217ebf01cc819d5c80ca99aff5666cb3ddce4934602897b4715bd',
    viewTag: '0xcd',
    stealthAddress: '0x6Ae07edE174C19e3c9A73e2913885e1B7aca13dd',
    stealthPrivateKey: '0xcd36b55d26196fc0b96312b01dd978fc5e380c8afeab49aae283f0ca6a814ff3',
  },
  {
    spendingPrivateKey: '0x1111111111111111111111111111111111111111111111111111111111111111',
    viewingPrivateKey: '0x2222222222222222222222222222222222222222222222222222222222222222',
    ephemeralPrivateKey: '0x3333333333333333333333333333333333333333333333333333333333333333',
    spendingPubKey: '0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa',
    viewingPubKey: '0x02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27',
    ephemeralPubKey: '0x023c72addb4fdf09af94f0c94d7fe92a386a7e70cf8a1d85916386bb2535c7b1b1',
    ephemeralUncompressedPubKey:
      '0x043c72addb4fdf09af94f0c94d7fe92a386a7e70cf8a1d85916386bb2535c7b1b13b306b0fe085665d8fc1b28ae1676cd3ad6e08eaeda225fe38d0da4de55703e0',
    viewTag: '0x20',
    stealthAddress: '0xD8606eD2ecDB71fdcb8cCA8fA1925ff84238f2a9',
    stealthPrivateKey: '0x32074def70f9689560d0eb1b86aa895b735ed5852c9ce187ff0dcd968e8a19d3',
  },
] as const

const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const key = (value: bigint): Hex => `0x${value.toString(16).padStart(64, '0')}`

describe('stealth crypto compatibility with noble-curves 1.9.7', () => {
  describe.each(vectors)('announcement $ephemeralPubKey', (vector) => {
    it('preserves compressed public keys', () => {
      expect(derivePublicKey(vector.spendingPrivateKey)).toBe(vector.spendingPubKey)
      expect(derivePublicKey(vector.viewingPrivateKey)).toBe(vector.viewingPubKey)
      expect(derivePublicKey(vector.ephemeralPrivateKey)).toBe(vector.ephemeralPubKey)
    })

    it('preserves uncompressed public keys', () => {
      expect(derivePublicKey(vector.ephemeralPrivateKey, false)).toBe(
        vector.ephemeralUncompressedPubKey
      )
    })

    it('preserves the recipient private key and address', () => {
      for (const publicKey of [vector.ephemeralPubKey, vector.ephemeralUncompressedPubKey]) {
        expect(
          computeStealthPrivateKey(publicKey, vector.spendingPrivateKey, vector.viewingPrivateKey)
        ).toEqual({
          stealthAddress: vector.stealthAddress,
          stealthPrivateKey: vector.stealthPrivateKey,
        })
      }
    })

    it('preserves the view tag and rejects a different tag', () => {
      for (const publicKey of [vector.ephemeralPubKey, vector.ephemeralUncompressedPubKey]) {
        expect(checkViewTag(publicKey, vector.viewingPrivateKey, vector.viewTag)).toBe(true)
        const wrongTag = `0x${(Number.parseInt(vector.viewTag.slice(2), 16) ^ 1)
          .toString(16)
          .padStart(2, '0')}` as Hex
        expect(checkViewTag(publicKey, vector.viewingPrivateKey, wrongTag)).toBe(false)
      }
    })

    it('produces a spendable Ethereum key for an existing announcement', async () => {
      const result = computeStealthPrivateKey(
        vector.ephemeralPubKey,
        vector.spendingPrivateKey,
        vector.viewingPrivateKey
      )
      const account = privateKeyToAccount(result.stealthPrivateKey)
      expect(account.address).toBe(vector.stealthAddress)
      const message = 'Stealth migration compatibility'
      const signature = await account.signMessage({ message })
      expect(await verifyMessage({ address: vector.stealthAddress, message, signature })).toBe(true)
    })

    it('keeps new announcements recoverable by the recipient', () => {
      const generated = generateStealthAddressCrypto(vector.spendingPubKey, vector.viewingPubKey)
      const result = computeStealthPrivateKey(
        generated.ephemeralPubKey,
        vector.spendingPrivateKey,
        vector.viewingPrivateKey
      )
      expect(result.stealthAddress).toBe(generated.stealthAddress)
      expect(privateKeyToAccount(result.stealthPrivateKey).address).toBe(generated.stealthAddress)
      expect(
        checkViewTag(generated.ephemeralPubKey, vector.viewingPrivateKey, generated.viewTag)
      ).toBe(true)
    })
  })

  it.each([0n, order, order + 1n])('rejects invalid private scalar %s', (scalar) => {
    const invalidKey = key(scalar)
    expect(() => derivePublicKey(invalidKey)).toThrow('Invalid private key')
    expect(() =>
      computeStealthPrivateKey(vectors[0].ephemeralPubKey, invalidKey, vectors[0].viewingPrivateKey)
    ).toThrow('Invalid private key')
    expect(() => checkViewTag(vectors[0].ephemeralPubKey, invalidKey, vectors[0].viewTag)).toThrow(
      'Invalid private key'
    )
  })

  it.each([
    '0x',
    '0x00',
    `0x02${'00'.repeat(32)}`,
    `0x02${'ff'.repeat(32)}`,
    `0x04${'00'.repeat(64)}`,
    `0x05${vectors[0].ephemeralPubKey.slice(4)}`,
  ] as Hex[])('rejects invalid or identity public key %s', (publicKey) => {
    expect(() => generateStealthAddressCrypto(publicKey, vectors[0].viewingPubKey)).toThrow(
      'Invalid public key'
    )
    expect(() =>
      computeStealthPrivateKey(
        publicKey,
        vectors[0].spendingPrivateKey,
        vectors[0].viewingPrivateKey
      )
    ).toThrow('Invalid public key')
    expect(() => checkViewTag(publicKey, vectors[0].viewingPrivateKey, vectors[0].viewTag)).toThrow(
      'Invalid public key'
    )
  })
})
