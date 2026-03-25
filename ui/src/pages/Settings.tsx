import { Settings, Moon, Sun, Monitor, Key, RefreshCw, AlertCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

type Theme = 'dark' | 'light' | 'system'

export default function SettingsPage() {
  const { apiFetch, logout } = useAuth()
  const [theme, setTheme] = useState<Theme>('system')
  const [currentToken, setCurrentToken] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState('')
  const [regenerateSuccess, setRegenerateSuccess] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('foxfang-auth')
    if (stored) {
      try {
        const auth = JSON.parse(stored)
        setCurrentToken(auth.token || '')
      } catch {
        // ignore parse error
      }
    }
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('foxfang-theme') as Theme
    if (stored) setTheme(stored)
  }, [])

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
    localStorage.setItem('foxfang-theme', newTheme)

    const root = document.documentElement
    if (newTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.setAttribute('data-theme', isDark ? 'dark' : 'light')
    } else {
      root.setAttribute('data-theme', newTheme)
    }
  }

  const handleRegenerateToken = async () => {
    setIsRegenerating(true)
    setRegenerateError('')
    setRegenerateSuccess('')

    try {
      const response = await apiFetch('/gateway/regenerate-token', { method: 'POST' })
      const data = await response.json()

      if (response.ok && data.ok) {
        setRegenerateSuccess(data.message)
        // Wait a bit then logout so user can login with new token
        setTimeout(() => {
          logout()
        }, 3000)
      } else {
        setRegenerateError(data.error || 'Failed to regenerate token')
      }
    } catch (error) {
      setRegenerateError('Network error. Please try again.')
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <header className="flex items-center gap-4 mb-8 pb-6 border-b border-border-default">
        <Settings className="w-10 h-10 text-fox-primary" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Settings</h1>
          <p className="text-text-secondary">Configure your FoxFang preferences</p>
        </div>
      </header>

      <div className="flex flex-col gap-8">
        {/* Gateway Auth Section */}
        <section className="bg-bg-secondary border border-border-default rounded-xl p-8">
          <h2 className="text-lg font-semibold text-text-primary mb-6 pb-4 border-b border-border-muted flex items-center gap-2">
            <Key className="w-5 h-5" />
            Gateway Authentication
          </h2>

          {regenerateSuccess && (
            <div className="mb-4 p-4 bg-success/10 border border-success rounded-lg text-success-text text-sm">
              {regenerateSuccess}
              <p className="mt-2 text-xs">You will be logged out shortly. Please login again with the new token.</p>
            </div>
          )}

          {regenerateError && (
            <div className="mb-4 p-4 bg-danger/10 border border-danger rounded-lg text-danger-text text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {regenerateError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Current Token/Password</label>
              <div className="px-4 py-3 bg-bg-primary border border-border-default rounded-lg font-mono text-sm text-text-secondary break-all">
                {currentToken ? `${currentToken.slice(0, 8)}...${currentToken.slice(-8)}` : 'Not available'}
              </div>
              <p className="mt-2 text-xs text-text-muted">This is your gateway access token. Used for both web UI and API access.</p>
            </div>

            <button
              onClick={handleRegenerateToken}
              disabled={isRegenerating}
              className="flex items-center gap-2 px-4 py-2.5 bg-bg-tertiary border border-border-default rounded-lg text-text-primary hover:bg-bg-hover hover:border-fox-primary transition-all duration-fast disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
              {isRegenerating ? 'Regenerating...' : 'Regenerate Token'}
            </button>
          </div>
        </section>

        <section className="bg-bg-secondary border border-border-default rounded-xl p-8">
          <h2 className="text-lg font-semibold text-text-primary mb-6 pb-4 border-b border-border-muted">Appearance</h2>

          <div className="flex items-center justify-between py-4 border-b border-border-muted">
            <div>
              <h3 className="text-15px font-medium text-text-primary mb-1">Theme</h3>
              <p className="text-sm text-text-secondary">Choose your preferred color scheme</p>
            </div>

            <div className="flex gap-2">
              <button
                className={`flex flex-col items-center gap-2 px-5 py-4 bg-bg-primary border rounded-lg text-sm transition-all duration-fast min-w-[80px] cursor-pointer ${
                  theme === 'dark'
                    ? 'border-fox-primary text-fox-primary bg-fox-primary/5'
                    : 'border-border-default text-text-secondary hover:border-border-default hover:text-text-primary'
                }`}
                onClick={() => handleThemeChange('dark')}
              >
                <Moon className="w-5 h-5" />
                <span>Dark</span>
              </button>

              <button
                className={`flex flex-col items-center gap-2 px-5 py-4 bg-bg-primary border rounded-lg text-sm transition-all duration-fast min-w-[80px] cursor-pointer ${
                  theme === 'light'
                    ? 'border-fox-primary text-fox-primary bg-fox-primary/5'
                    : 'border-border-default text-text-secondary hover:border-border-default hover:text-text-primary'
                }`}
                onClick={() => handleThemeChange('light')}
              >
                <Sun className="w-5 h-5" />
                <span>Light</span>
              </button>

              <button
                className={`flex flex-col items-center gap-2 px-5 py-4 bg-bg-primary border rounded-lg text-sm transition-all duration-fast min-w-[80px] cursor-pointer ${
                  theme === 'system'
                    ? 'border-fox-primary text-fox-primary bg-fox-primary/5'
                    : 'border-border-default text-text-secondary hover:border-border-default hover:text-text-primary'
                }`}
                onClick={() => handleThemeChange('system')}
              >
                <Monitor className="w-5 h-5" />
                <span>System</span>
              </button>
            </div>
          </div>
        </section>

        <section className="bg-bg-secondary border border-border-default rounded-xl p-8">
          <h2 className="text-lg font-semibold text-text-primary mb-6 pb-4 border-b border-border-muted">About</h2>

          <div className="flex items-center justify-between py-4">
            <div>
              <h3 className="text-15px font-medium text-text-primary mb-1">Version</h3>
              <p className="text-sm text-text-secondary">FoxFang v1.0.0</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
