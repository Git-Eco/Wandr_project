import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './context/AppContext'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import TripDetails from './pages/TripDetails'
import SharePage from './pages/SharePage'

function Spinner() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" style={{ width:32, height:32 }} />
    </div>
  )
}

export default function App() {
  const { session } = useApp()

  if (session === undefined) return <Spinner />

  return (
    <Routes>
      <Route path="/auth"        element={session ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/"            element={session ? <Dashboard /> : <Navigate to="/auth" replace />} />
      <Route path="/trip/:id"    element={session ? <TripDetails /> : <Navigate to="/auth" replace />} />
      {/* Public — no auth required */}
      <Route path="/share/:id"   element={<SharePage />} />
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  )
}
