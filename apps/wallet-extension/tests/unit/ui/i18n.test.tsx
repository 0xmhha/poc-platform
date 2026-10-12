import { act, render, screen } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import { changeLanguage, initI18n } from '../../../src/i18n'

jest.unmock('react-i18next')

function TranslationProbe() {
  const { t, i18n } = useTranslation('common')
  return (
    <div>
      <span>{t('confirm')}</span>
      <span>{t('version', { version: '1.2.3' })}</span>
      <span>{i18n.language}</span>
    </div>
  )
}

describe('wallet translations with the real React integration', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true })
  })

  it('uses the persisted language and resolves namespaced translations', async () => {
    await chrome.storage.local.set({ stablenet_language: 'ko' })
    const i18n = await initI18n()

    expect(i18n.language).toBe('ko')
    expect(i18n.t('confirm')).toBe('확인')
    expect(i18n.t('title', { ns: 'activity' })).toBe('활동')
  })

  it('updates mounted hooks and interpolation when the language changes', async () => {
    await initI18n()
    render(<TranslationProbe />)
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Version 1.2.3')).toBeInTheDocument()

    await act(async () => changeLanguage('ko'))

    expect(screen.getByText('확인')).toBeInTheDocument()
    expect(screen.getByText('버전 1.2.3')).toBeInTheDocument()
    expect(screen.getByText('ko')).toBeInTheDocument()
    expect(await chrome.storage.local.get('stablenet_language')).toEqual({
      stablenet_language: 'ko',
    })
    expect(localStorage.getItem('stablenet_language')).toBe('ko')
  })

  it('falls back to local storage when Chrome storage fails and to English for missing locales', async () => {
    localStorage.setItem('stablenet_language', 'fr')
    ;(chrome.storage.local.get as jest.Mock).mockRejectedValueOnce(new Error('unavailable'))
    const i18n = await initI18n()

    expect(i18n.language).toBe('fr')
    expect(i18n.t('confirm')).toBe('Confirm')
    expect(i18n.t('version', { version: '1.2.3' })).toBe('Version 1.2.3')
  })
})
