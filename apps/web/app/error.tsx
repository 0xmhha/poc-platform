'use client'

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/error'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <ErrorFallback
        error={error}
        resetError={reset}
        showResetButton
        showHomeButton
        severity="error"
      />
    </div>
  )
}
