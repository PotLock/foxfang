import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout/index'
import Login from './pages/Login/index'
import Dashboard from './pages/Dashboard/index'
import Boards from './pages/Boards/index'
import Campaigns from './pages/Campaigns/index'
import Agents from './pages/Agents/index'
import Settings from './pages/Settings/index'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  
  // Preserve query params (like token) when redirecting to login
  if (!isAuthenticated) {
    const loginUrl = '/login' + location.search
    return <Navigate to={loginUrl} replace />
  }
  
  return children
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth()
  
  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Connecting to FoxFang...</p>
      </div>
    )
  }
  
  return (
    <Routes>
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/" replace /> : <Login />
      } />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="boards" element={<Boards />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="agents" element={<Agents />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
