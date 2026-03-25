import { createContext, useState, useCallback, ReactNode, useEffect } from 'react'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  token: string | null
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>
  login: (token: string) => Promise<boolean>
  logout: () => void
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY = 'foxfang-auth'

interface AuthStorage {
  token: string
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  
  // Check for existing auth on mount
  useEffect(() => {
    const verifyStoredToken = async () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const auth: AuthStorage = JSON.parse(stored)
          // Verify token with API
          const response = await fetch('/api/auth', {
            headers: {
              'Authorization': `Bearer ${auth.token}`
            }
          })
          
          if (response.ok) {
            setToken(auth.token)
            setIsAuthenticated(true)
          } else {
            localStorage.removeItem(STORAGE_KEY)
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY)
        }
      }
      setIsLoading(false)
    }
    
    verifyStoredToken()
  }, [])
  
  const apiFetch = useCallback(async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    
    return fetch(`/api${endpoint}`, {
      ...options,
      headers,
    })
  }, [token])
  
  const login = useCallback(async (authToken: string): Promise<boolean> => {
    try {
      // Verify token with API
      const response = await fetch('/api/auth', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      
      if (response.ok) {
        setToken(authToken)
        setIsAuthenticated(true)
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          token: authToken
        }))
        return true
      }
      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }, [])
  
  const logout = useCallback(() => {
    setIsAuthenticated(false)
    setToken(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])
  
  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isLoading,
      token,
      apiFetch,
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}
