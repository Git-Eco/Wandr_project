import { useState } from 'react'
import { supabase } from '../supabase'
import styles from './AuthPage.module.css'

export default function AuthPage() {
  const [panel, setPanel]     = useState('login')
  const [email, setEmail]     = useState('')
  const [pass, setPass]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  const isLogin = panel === 'login'

  function switchPanel(p) {
    setPanel(p); setError(''); setSuccess(''); setEmail(''); setPass(''); setConfirm('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw error
        // App.jsx will pick up the session change automatically
      } else {
        if (pass !== confirm) throw new Error("Passwords don't match.")
        if (pass.length < 6)  throw new Error('Password must be at least 6 characters.')
        const { error } = await supabase.auth.signUp({ email, password: pass })
        if (error) throw error
        setSuccess('Account created! You can now sign in.')
        switchPanel('login')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* ── Left — form ── */}
        <div className={styles.formSide}>
          <h2 className={styles.title}>{isLogin ? 'Sign in' : 'Create account'}</h2>
          <p className={styles.subtitle}>{isLogin ? 'Welcome back, traveller.' : 'Start planning your adventures.'}</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className="form-group">
              <label>Email address</label>
              <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} required />
            </div>
            {!isLogin && (
              <div className="form-group">
                <label>Confirm password</label>
                <input type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required />
              </div>
            )}

            {error   && <div className="info-banner red">{error}</div>}
            {success && <div className="info-banner green">{success}</div>}

            <button type="submit" className={`btn btn-primary btn-full ${styles.submitBtn}`} disabled={loading}>
              {loading ? <span className="spinner" /> : (isLogin ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className={styles.switchRow}>
            <span>{isLogin ? 'Not a member?' : 'Already a member?'}</span>
            <button className={styles.switchLink} onClick={() => switchPanel(isLogin ? 'signup' : 'login')}>
              {isLogin ? 'Sign up now' : 'Sign in now'}
            </button>
          </div>
        </div>

        {/* ── Right — brand panel ── */}
        <div className={styles.brandSide}>
          <div className={styles.brandInner}>
            <span className={styles.plane}>✈️</span>
            <h1 className={styles.brandName}>Wandr</h1>
            <h3 className={styles.brandHeadline}>{isLogin ? 'Welcome back!' : 'Hello, traveller!'}</h3>
            <p className={styles.brandBody}>
              {isLogin
                ? 'Your next adventure is waiting. Sign in to pick up where you left off.'
                : 'Create an account and let Wandr plan your perfect trip — from day one to the last sunset.'}
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
