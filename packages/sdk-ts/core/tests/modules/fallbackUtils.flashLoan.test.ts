import { describe, expect, it } from 'vitest'
import {
  calculateSelector,
  encodeBeginFlashLoan,
  encodeFlashLoanAddToWhitelist,
  encodeFlashLoanInit,
  FLASH_LOAN_CALLBACK_SELECTORS,
} from '../../src/modules/utils/fallbackUtils'

// Expected values come from the FlashLoanFallback contract ABI (forge inspect / cast).
const LENDER = '0x1111111111111111111111111111111111111111'

describe('FlashLoanFallback encoding', () => {
  it('encodes onInstall data as abi.encode(bool requireWhitelist, bool logFlashLoans)', () => {
    expect(encodeFlashLoanInit({ requireWhitelistedProtocol: true, logFlashLoans: false })).toBe(
      `0x${'0'.repeat(63)}1${'0'.repeat(64)}`
    )
  })

  it('encodes beginFlashLoan(address)', () => {
    expect(encodeBeginFlashLoan(LENDER)).toBe(`0x3c9edbe4${'0'.repeat(24)}${LENDER.slice(2)}`)
  })

  it('encodes addToWhitelist(address)', () => {
    expect(encodeFlashLoanAddToWhitelist(LENDER)).toBe(
      `0xe43252d7${'0'.repeat(24)}${LENDER.slice(2)}`
    )
  })

  it('callback selector constants match their signatures', () => {
    expect(calculateSelector('executeOperation(address[],uint256[],uint256[],address,bytes)')).toBe(
      FLASH_LOAN_CALLBACK_SELECTORS.AAVE_EXECUTE_OPERATION
    )
    expect(calculateSelector('uniswapV3FlashCallback(uint256,uint256,bytes)')).toBe(
      FLASH_LOAN_CALLBACK_SELECTORS.UNISWAP_V3_FLASH_CALLBACK
    )
    expect(calculateSelector('receiveFlashLoan(address[],uint256[],uint256[],bytes)')).toBe(
      FLASH_LOAN_CALLBACK_SELECTORS.BALANCER_RECEIVE_FLASH_LOAN
    )
    expect(calculateSelector('onFlashLoan(address,address,uint256,uint256,bytes)')).toBe(
      FLASH_LOAN_CALLBACK_SELECTORS.ERC3156_ON_FLASH_LOAN
    )
  })
})
