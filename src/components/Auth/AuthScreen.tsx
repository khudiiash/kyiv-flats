import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

export function AuthScreen() {
  const { login, register, loginWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleGoogleSignIn = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await loginWithGoogle()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка'
      if (msg.includes('auth/popup-closed-by-user')) {
        setError(null)
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Заповніть email та пароль')
      return
    }
    if (password.length < 6) {
      setError('Пароль має бути не менше 6 символів')
      return
    }
    setSubmitting(true)
    try {
      if (isRegister) {
        await register(email.trim(), password)
      } else {
        await login(email.trim(), password)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка'
      if (msg.includes('auth/email-already-in-use')) {
        setError('Цей email вже зареєстровано. Увійдіть.')
      } else if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        setError('Невірний email або пароль')
      } else if (msg.includes('auth/invalid-email')) {
        setError('Невірний формат email')
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-screen__card">
        <h1 className="auth-screen__title">Київські квартири</h1>
        <p className="auth-screen__subtitle">
          {isRegister ? 'Створіть обліковий запис' : 'Увійдіть у свій обліковий запис'}
        </p>
        <form onSubmit={handleSubmit} className="auth-screen__form">
          <label className="auth-screen__label">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              autoComplete="email"
              disabled={submitting}
              className="auth-screen__input"
            />
          </label>
          <label className="auth-screen__label">
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              disabled={submitting}
              className="auth-screen__input"
            />
          </label>
          {error && <div className="auth-screen__error">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="btn btn--primary auth-screen__submit"
          >
            {submitting ? '…' : isRegister ? 'Зареєструватися' : 'Увійти'}
          </button>
        </form>
        <div className="auth-screen__divider">або</div>
        <button
          type="button"
          className="btn auth-screen__google"
          onClick={handleGoogleSignIn}
          disabled={submitting}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
          </svg>
          Увійти через Google
        </button>
        <button
          type="button"
          className="auth-screen__toggle"
          onClick={() => {
            setIsRegister((v) => !v)
            setError(null)
          }}
        >
          {isRegister ? 'Вже є обліковий запис? Увійти' : 'Немає облікового запису? Зареєструватися'}
        </button>
      </div>
    </div>
  )
}
