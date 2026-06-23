import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

// ─── Discord OAuth callback handler ──────────────────────────────────────────
// After Discord redirects back to /login?code=xxx, we exchange the code
// with our FastAPI backend, receive a JWT, store it, then go to /dashboard.

export default function Login() {
  const router = useRouter()
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('')

  // Handle the OAuth callback code that Discord appends to the URL
  useEffect(() => {
    const { code, error } = router.query
    if (!code && !error) return

    if (error) {
      setStatus('error')
      setErrorMsg('Discord authorization was cancelled.')
      return
    }

    if (code) {
      setStatus('loading')
      exchangeCode(code)
    }
  }, [router.query])

  async function exchangeCode(code) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/callback?code=${encodeURIComponent(code)}`,
        { method: 'GET' }
      )
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.detail || 'Authentication failed.')
      }

      // Store JWT in httpOnly cookie via the API (already set by FastAPI)
      // Also store a non-sensitive copy in localStorage for UI use
      localStorage.setItem('nv_user', JSON.stringify({
        id:       data.user.id,
        username: data.user.username,
        avatar:   data.user.avatar,
        tier:     data.user.tier,
      }))

      router.replace('/dashboard')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
    }
  }

    async function handleLogin() {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/url`, {
        credentials: 'include',
        })
        const { url } = await res.json()
        window.location.href = url
    } catch {
        setStatus('error')
        setErrorMsg('Could not reach the server. Make sure the backend is running.')
    }
    }
  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>Sign In — Nitro Vault</title>
        <meta name="description" content="Sign in to Nitro Vault with your Discord account." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      </Head>

      <div className="login-shell">

        {/* Subtle radial background glow — matches hero section */}
        <div className="login-glow" aria-hidden="true" />

        {/* Back to home */}
        <a href="/" className="login-back">
          <i className="fa-solid fa-arrow-left" />
          Back to Nitro Vault
        </a>

        <div className="login-card">

          {/* Logo */}
          <a href="/" className="login-logo">
            <img src="/Logo.png" alt="Nitro Vault" />
          </a>

          {/* ── Idle state: show the sign-in prompt ── */}
          {status === 'idle' && (
            <>
              <div className="login-eyebrow">
                <span className="live-dot" />
                Secure sign-in
              </div>
              <h1 className="login-title">Welcome back.</h1>
              <p className="login-sub">
                Sign in with Discord to access Nitro Vault.
              </p>

              <button className="btn-discord" onClick={handleLogin}>
                <i className="fa-brands fa-discord" />
                Continue with Discord
              </button>

              <div className="login-divider">
                <span>Simple & Secure</span>
              </div>


              <p className="login-legal">
                By continuing you agree to our{' '}
                <a href="#">Terms of Service</a> and{' '}
                <a href="#">Privacy Policy</a>.
              </p>
            </>
          )}

          {/* ── Loading state ── */}
          {status === 'loading' && (
            <div className="login-loading">
              <div className="login-spinner" />
              <p className="login-loading-text">Signing you in</p>
              <p className="login-loading-sub">Verifying with Discord. This takes a second.</p>
            </div>
          )}

          {/* ── Error state ── */}
          {status === 'error' && (
            <div className="login-error-state">
              <div className="login-error-icon">
                <i className="fa-solid fa-circle-exclamation" />
              </div>
              <h2 className="login-error-title">Sign-in failed</h2>
              <p className="login-error-msg">{errorMsg}</p>
              <button
                className="btn-discord"
                onClick={() => { setStatus('idle'); setErrorMsg('') }}
              >
                <i className="fa-solid fa-arrow-rotate-left" />
                Try again
              </button>
            </div>
          )}

        </div>

        {/* Footer strip */}
        <p className="login-footer">
          Copyright &copy; 2025 Nitro Vault. All rights reserved.
        </p>

      </div>

      <style jsx>{`
        /* ── Shell ───────────────────────────────────────────────────── */
        .login-shell {
          min-height: 100vh;
          background: linear-gradient(180deg, #ffffff 0%, #f5f5f7 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          position: relative;
          overflow: hidden;
        }

        /* Matches the hero radial glow */
        .login-glow {
          position: absolute;
          top: -200px; left: 50%;
          transform: translateX(-50%);
          width: 700px; height: 700px;
          background: radial-gradient(
            ellipse at center,
            rgba(88,101,242,0.07) 0%,
            transparent 70%
          );
          pointer-events: none;
          z-index: 0;
        }

        /* ── Back link ───────────────────────────────────────────────── */
        .login-back {
          position: absolute;
          top: 24px; left: 28px;
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 0.8125rem; font-weight: 500;
          color: var(--gray-500); text-decoration: none;
          transition: color 0.2s;
          z-index: 10;
        }
        .login-back:hover { color: var(--gray-900); }
        .login-back i { font-size: 11px; }

        /* ── Card ────────────────────────────────────────────────────── */
        .login-card {
          background: var(--white);
          border-radius: var(--radius-xl);
          border: 0.5px solid var(--gray-100);
          box-shadow: var(--shadow-xl);
          padding: 48px 44px;
          width: 100%;
          max-width: 440px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          position: relative;
          z-index: 1;
          animation: fadeUp 0.5s ease 0.05s both;
        }

        /* ── Logo ────────────────────────────────────────────────────── */
        .login-logo {
          display: block;
          margin-bottom: 32px;
          text-decoration: none;
        }
        .login-logo img {
          height: 36px;
          width: auto;
        }

        /* ── Eyebrow ─────────────────────────────────────────────────── */
        .login-eyebrow {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--nitro-light); color: var(--nitro);
          font-size: 0.6875rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          padding: 4px 12px; border-radius: 980px;
          border: 1px solid rgba(88,101,242,0.15);
          margin-bottom: 20px;
        }

        /* ── Titles ──────────────────────────────────────────────────── */
        .login-title {
          font-size: 2rem; font-weight: 700;
          letter-spacing: -0.025em; color: var(--gray-900);
          margin-bottom: 10px; line-height: 1.1;
        }
        .login-sub {
          font-size: 0.9375rem; color: var(--gray-500);
          line-height: 1.6; margin-bottom: 28px;
          max-width: 320px;
        }

        /* ── Discord button ──────────────────────────────────────────── */
        .btn-discord {
          width: 100%;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          background: var(--nitro); color: white;
          font-size: 1rem; font-weight: 600;
          padding: 14px 24px; border-radius: 980px;
          border: none; cursor: pointer;
          box-shadow: 0 4px 16px rgba(88,101,242,0.3);
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
          font-family: inherit;
        }
        .btn-discord:hover {
          background: var(--nitro-hover);
          transform: translateY(-1px);
          box-shadow: 0 6px 22px rgba(88,101,242,0.35);
        }
        .btn-discord:active { transform: scale(0.98); }
        .btn-discord i { font-size: 18px; }

        /* ── Divider ─────────────────────────────────────────────────── */
        .login-divider {
          width: 100%; display: flex; align-items: center; gap: 12px;
          margin: 24px 0 18px;
        }
        .login-divider::before,
        .login-divider::after {
          content: ''; flex: 1;
          height: 0.5px; background: var(--gray-100);
        }
        .login-divider span {
          font-size: 0.75rem; font-weight: 500;
          color: var(--gray-300); white-space: nowrap;
          letter-spacing: 0.04em;
        }

        /* ── Permissions list ────────────────────────────────────────── */
        .login-perms {
          list-style: none;
          width: 100%;
          display: flex; flex-direction: column; gap: 10px;
          text-align: left;
          margin-bottom: 24px;
        }
        .login-perms li {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 12px 14px;
          background: var(--gray-50);
          border-radius: var(--radius-md);
          border: 0.5px solid var(--gray-100);
        }
        .login-perms li div:last-child {
          display: flex; flex-direction: column; gap: 1px;
        }
        .login-perms strong {
          font-size: 0.875rem; font-weight: 600; color: var(--gray-900);
        }
        .login-perms span {
          font-size: 0.8125rem; color: var(--gray-500);
        }
        .perm-icon {
          width: 24px; height: 24px; border-radius: 7px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; margin-top: 1px;
        }
        .perm-icon.green { background: #e9faf0; color: #1a7f37; }
        .perm-icon.red   { background: #fff1f0; color: #ff3b30; }

        /* ── Legal ───────────────────────────────────────────────────── */
        .login-legal {
          font-size: 0.8125rem; color: var(--gray-300);
          line-height: 1.6;
        }
        .login-legal a {
          color: var(--nitro); text-decoration: none;
          transition: opacity 0.2s;
        }
        .login-legal a:hover { opacity: 0.75; }

        /* ── Loading state ───────────────────────────────────────────── */
        .login-loading {
          display: flex; flex-direction: column;
          align-items: center; gap: 16px;
          padding: 20px 0;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .login-spinner {
          width: 40px; height: 40px; border-radius: 50%;
          border: 2.5px solid var(--gray-100);
          border-top-color: var(--nitro);
          animation: spin 0.8s linear infinite;
        }
        .login-loading-text {
          font-size: 1.0625rem; font-weight: 600; color: var(--gray-900);
        }
        .login-loading-sub {
          font-size: 0.875rem; color: var(--gray-500);
          margin-top: -8px;
        }

        /* ── Error state ─────────────────────────────────────────────── */
        .login-error-state {
          display: flex; flex-direction: column;
          align-items: center; gap: 12px;
          padding: 10px 0;
          width: 100%;
        }
        .login-error-icon {
          width: 48px; height: 48px; border-radius: 50%;
          background: #fff1f0;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; color: #ff3b30;
          margin-bottom: 4px;
        }
        .login-error-title {
          font-size: 1.125rem; font-weight: 700; color: var(--gray-900);
        }
        .login-error-msg {
          font-size: 0.9375rem; color: var(--gray-500);
          line-height: 1.6; margin-bottom: 8px;
        }

        /* ── Live dot (reused from globals) ──────────────────────────── */
        .live-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--green);
          animation: pulse 2s ease-in-out infinite;
          display: inline-block;
        }

        /* ── Footer ──────────────────────────────────────────────────── */
        .login-footer {
          font-size: 0.8125rem; color: var(--gray-300);
          margin-top: 32px; position: relative; z-index: 1;
        }

        /* ── Responsive ──────────────────────────────────────────────── */
        @media (max-width: 480px) {
          .login-card { padding: 36px 24px; }
          .login-back { top: 16px; left: 16px; }
        }
      `}</style>
    </>
  )
}