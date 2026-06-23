import { useEffect, useRef, useState, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler
)

// ─── Constants ─────────────────────────const router = useRouter()──────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL
const SESSION_MAX_DAYS = 5

const VIEW_TITLES = {
  overview:  'Overview',
  claims:    'Snipe Claims',
  analytics: 'Balance Analytics',
  gifting:   'Nitro Gifting',
  purchase:  'Purchase Credits',
  history:   'Snipe History',
  credits:   'Member Credits',
  settings:  'Settings',
}
const CHART_FONT = { family: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif', size: 12 }

// ─── Secure API helper ────────────────────────────────────────────────────────
// Always sends credentials (httpOnly cookies), auto-refreshes on 401

let isRefreshing = false
let refreshQueue = []

async function apiFetch(path, opts = {}, router) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })

  if (res.status === 401 && !isRefreshing) {
    isRefreshing = true
    try {
      const ref = await fetch(`${API}/auth/refresh`, {
        method: 'POST', credentials: 'include',
      })
      if (!ref.ok) throw new Error('refresh failed')
      isRefreshing = false
      refreshQueue.forEach(fn => fn())
      refreshQueue = []
      return apiFetch(path, opts, router)
    } catch {
      isRefreshing = false
      router.replace('/login')
      return null
    }
  }
  return res
}

// ─── Session guard ────────────────────────────────────────────────────────────

function checkSessionExpiry(router) {
  const raw = localStorage.getItem('nv_login_time')
  if (!raw) return true  // no timestamp yet — let /users/me decide
  const loginTime = parseInt(raw, 10)
  const elapsed = (Date.now() - loginTime) / 1000 / 60 / 60 / 24
  if (elapsed >= SESSION_MAX_DAYS) {
    localStorage.clear()
    router.replace('/login')
    return false
  }
  return true
}

// ─── Notification system ──────────────────────────────────────────────────────

function useNotifications() {
  const [notifs, setNotifs] = useState([])

  const push = useCallback((type, title, msg) => {
    const id = Date.now()
    setNotifs(n => [...n, { id, type, title, msg, visible: true }])
    setTimeout(() => dismiss(id), 4500)
  }, [])

  const dismiss = useCallback((id) => {
    setNotifs(n => n.map(x => x.id === id ? { ...x, visible: false } : x))
    setTimeout(() => setNotifs(n => n.filter(x => x.id !== id)), 300)
  }, [])

  return { notifs, push, dismiss }
}

function NotifContainer({ notifs, dismiss }) {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' }
  return (
    <div style={{ position:'fixed', bottom:28, right:28, display:'flex', flexDirection:'column', gap:10, zIndex:9999, pointerEvents:'none' }}>
      {notifs.map(n => (
        <div key={n.id} className={`notif ${n.visible ? 'show' : 'hide'}`} style={{ pointerEvents:'all' }}>
          <div className={`notif-icon ${n.type}`}><i className={`fa-solid ${icons[n.type]}`} /></div>
          <div className="notif-body">
            <div className="notif-title">{n.title}</div>
            <div className="notif-msg">{n.msg}</div>
          </div>
          <button className="notif-close" onClick={() => dismiss(n.id)}><i className="fa-solid fa-xmark" /></button>
        </div>
      ))}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ view, setView, user, onLogout, open, onClose }) {
  const tierIcon = { copper:'fa-medal', silver:'fa-shield', gold:'fa-crown', diamond:'fa-gem' }
  const tierColor = { copper:'#92400e', silver:'#636366', gold:'#b45309', diamond:'#5865f2' }

  const navItem = (id, icon, label, badge) => (
    <div
      key={id}
      className={`nav-item ${view === id ? 'active' : ''}`}
      onClick={() => { setView(id); onClose() }}
    >
      <i className={`fa-solid ${icon}`} />
      {label}
      {badge && <span className="nav-badge">{badge}</span>}
    </div>
  )

  return (
    <>
      <div className={`sidebar-overlay ${open ? 'visible' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <a className="sidebar-logo" href="/">
          <img src="/Logo.png" alt="Nitro Vault" style={{ height: 31, width: 'auto' }} />
        </a>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Overview</div>
          {navItem('overview',  'fa-house',            'Overview')}
          {navItem('claims',    'fa-bolt',             'Snipe Claims')}
          {navItem('analytics', 'fa-chart-line',       'Balance Analytics')}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Features</div>
          {navItem('gifting',  'fa-gift',             'Nitro Gifting')}
          {navItem('history',  'fa-clock-rotate-left','Snipe History')}
          {navItem('credits',  'fa-gem',              'Member Credits', user?.tier ? user.tier.charAt(0).toUpperCase() + user.tier.slice(1) : '')}
          {navItem('purchase', 'fa-cart-shopping',    'Purchase Credits')}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Account</div>
          {navItem('settings', 'fa-gear', 'Settings')}
        </div>

        <div className="sidebar-footer">
          <div className="user-pill" onClick={onLogout}>
            <img
              className="user-avatar"
              src={user?.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`}
              alt={user?.username}
              onError={e => { e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png' }}
            />
            <div>
              <div className="user-name">{user?.username || '...'}</div>
              <div className="user-tier" style={{ color: tierColor[user?.tier] || '#5865f2' }}>
                <i className={`fa-solid ${tierIcon[user?.tier] || 'fa-medal'}`} style={{ fontSize: 9, marginRight: 4 }} />
                {user?.tier ? user.tier.charAt(0).toUpperCase() + user.tier.slice(1) : 'Copper'} Member
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function Topbar({ view, credits, onHamburger, onNotifClick, hasNotifs }) {
  return (
    <div className="topbar">
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button className="sidebar-hamburger" style={{ position:'relative', display:'flex' }} onClick={onHamburger}>
          <i className="fa-solid fa-bars" style={{ fontSize:15, color:'var(--gray-700)' }} />
        </button>
        <div className="topbar-title">{VIEW_TITLES[view]}</div>
      </div>
      <div className="topbar-right">
        <div className="credit-pill">
          <i className="fa-solid fa-gem" />
          <span>{credits}</span> Credits
        </div>
        <div className="topbar-icon-btn" onClick={onNotifClick}>
          <i className="fa-solid fa-bell" />
          {hasNotifs && <span className="notif-dot" />}
        </div>
      </div>
    </div>
  )
}

// ─── Overview view ────────────────────────────────────────────────────────────

function ViewOverview({ user, credits, history, setView, push }) {
  const nitroMonths = Math.floor(credits / 3)
  const successRate = history.length
    ? Math.round((history.filter(h => h.success).length / history.length) * 100)
    : 0
  const lifetimeClaims = user?.lifetime_claims || 0

  const recentClaims = history.slice(0, 7)
  const labels = recentClaims.map((_, i) => `T-${recentClaims.length - i}`).reverse()
  const data = recentClaims.map(h => h.quantity || 1).reverse()

  // ── Real "this week" stats ──────────────────────────────────────────────
  const now = new Date()
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
  const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const thisWeek = history.filter(h => new Date(h.created_at) >= weekAgo)
  const lastWeek = history.filter(h => {
    const d = new Date(h.created_at)
    return d >= twoWeeksAgo && d < weekAgo
  })

  // Nitro Balance change: net credits gained this week / 3, converted to months
  const creditsThisWeek = thisWeek.reduce((sum, h) => sum + (h.credits_spent < 0 ? -h.credits_spent : 0), 0)
  const monthsGainedThisWeek = Math.floor(creditsThisWeek / 3)
  const balanceChange = monthsGainedThisWeek > 0
    ? { text: `+${monthsGainedThisWeek} this week`, up: true }
    : { text: 'No change this week', up: null }

  // Credits change: net delta this week (positive = gained, negative = spent)
  const netCreditsThisWeek = thisWeek.reduce((sum, h) => sum - h.credits_spent, 0)
  const creditsChange = netCreditsThisWeek > 0
    ? { text: `+${netCreditsThisWeek} this week`, up: true }
    : netCreditsThisWeek < 0
      ? { text: `${netCreditsThisWeek} this week`, up: false }
      : { text: 'No change this week', up: null }

  // Success rate change vs last week
  const successThisWeek = thisWeek.length
    ? Math.round((thisWeek.filter(h => h.success).length / thisWeek.length) * 100)
    : null
  const successLastWeek = lastWeek.length
    ? Math.round((lastWeek.filter(h => h.success).length / lastWeek.length) * 100)
    : null

  let successChange
  if (successThisWeek === null) {
    successChange = { text: 'No claims yet', up: null }
  } else if (successLastWeek === null) {
    successChange = { text: `${successThisWeek}% this week`, up: null }
  } else {
    const diff = successThisWeek - successLastWeek
    successChange = diff === 0
      ? { text: 'Same as last week', up: null }
      : { text: `${diff > 0 ? '+' : ''}${diff}% vs last week`, up: diff > 0 }
  }

  return (
    <div className="view active">
      <div className="page-header">
        <h1>Good morning, {user?.username || '...'}</h1>
        <p>Here is everything happening with your Nitro Balance today.</p>
      </div>

      <div className="stats-grid">
        {[
          { label: 'Nitro Balance', value: nitroMonths, sub: 'months available', change: balanceChange.text, up: balanceChange.up },
          { label: 'Credits', value: credits, sub: 'in your account', change: creditsChange.text, up: creditsChange.up },
          { label: 'Total Claims', value: lifetimeClaims, sub: 'lifetime purchases', tier: user?.tier || 'copper' },
          { label: 'Success Rate', value: successRate + '%', sub: 'last 30 claims', change: successChange.text, up: successChange.up },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
            {s.tier ? (
              <div className="user-tier" style={{
                marginTop: 8,
                color: { copper:'#92400e', silver:'#636366', gold:'#b45309', diamond:'#5865f2' }[s.tier] || '#5865f2'
              }}>
                <i className={`fa-solid ${{ copper:'fa-medal', silver:'fa-shield', gold:'fa-crown', diamond:'fa-gem' }[s.tier] || 'fa-medal'}`}
                  style={{ fontSize: 9, marginRight: 4 }} />
                {s.tier.charAt(0).toUpperCase() + s.tier.slice(1)} Member
              </div>
            ) : (
              <span className={`stat-change ${s.up === true ? 'up' : s.up === false ? 'down' : 'neutral'}`}>
                {s.up === true && <i className="fa-solid fa-arrow-up" style={{ fontSize:9 }} />}
                {s.up === false && <i className="fa-solid fa-arrow-down" style={{ fontSize:9 }} />}
                {s.change}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="balance-widget">
          <div className="bw-label">Nitro Balance</div>
          <div className="bw-amount">
            <span className="bw-num">{nitroMonths}</span>
            <span className="bw-unit">Months</span>
          </div>
          <div className="bw-sub">approximately {nitroMonths * 30} days of Nitro available</div>
          <div className="bw-bar">
            <div className="bw-bar-fill" style={{ width: `${Math.min((nitroMonths / 12) * 100, 100)}%` }} />
          </div>
          <div className="bw-row">
            <span className="lbl">Next delivery</span>
            <span className="val"><span className="live-dot" style={{ marginRight:5 }} />Automatic</span>
          </div>
          <div className="bw-actions">
            <button className="btn-primary" onClick={() => setView('claims')}>
              <i className="fa-solid fa-bolt" /> Snipe More
            </button>
            <button className="btn-secondary" onClick={() => setView('gifting')}>
              <i className="fa-solid fa-gift" /> Gift Nitro
            </button>
          </div>
        </div>

        <div className="dash-right">
          <div className="card card-sm">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--gray-900)' }}>Claims this month</div>
                <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)' }}>Chance Drop and Assured Boost combined</div>
              </div>
            </div>
            <div className="chart-wrap">
              <Bar
                data={{
                  labels,
                  datasets: [{
                    label: 'Claims', data,
                    backgroundColor: 'rgba(88,101,242,0.12)',
                    borderColor: 'rgba(88,101,242,0.7)',
                    borderWidth: 1.5, borderRadius: 6, borderSkipped: false,
                  }]
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { display: false }, border: { display: false } },
                    y: { grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { stepSize: 1 } }
                  }
                }}
              />
            </div>
          </div>

          <div className="card card-sm">
            <div style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--gray-900)', marginBottom:4 }}>Recent Activity</div>
            <div className="activity-list">
              {history.slice(0, 4).map((h, i) => (
                <div className="activity-item" key={i}>
                  <div className={`activity-icon ${h.claim_type === 'gift' ? 'gift' : h.claim_type === 'credit' ? 'credit' : 'claim'}`}>
                    <i className={`fa-solid ${h.claim_type === 'gift' ? 'fa-gift' : h.claim_type === 'credit' ? 'fa-circle-plus' : 'fa-bolt'}`} />
                  </div>
                  <div className="activity-text">
                    <strong>{h.claim_type === 'chance_drop' ? 'Chance Drop' : h.claim_type === 'assured_boost' ? 'Assured Boost' : h.claim_type} x{h.quantity}</strong>
                    <span>{h.success ? 'Delivered to Balance' : 'Failed — refunded'}</span>
                  </div>
                  <div className="activity-time">{new Date(h.created_at).toLocaleDateString()}</div>
                </div>
              ))}
              {history.length === 0 && (
                <div style={{ padding:'20px 0', color:'var(--gray-500)', fontSize:'0.875rem', textAlign:'center' }}>No activity yet</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Claims view ──────────────────────────────────────────────────────────────

function ViewClaims({ credits, setCredits, history, setHistory, push, router, setUser }) {
  const [selectedType, setSelectedType] = useState(null)
  const [qty, setQty] = useState(1)
  const [loading, setLoading] = useState(false)

  const costMap = { chance_drop: 3, assured_boost: 5 }
  const cost = selectedType ? costMap[selectedType] * qty : 0

  async function confirmClaim() {
    if (!selectedType) return
    if (credits < cost) { push('error', 'Insufficient Credits', `You need ${cost} credits but only have ${credits}.`); return }
    setLoading(true)
    try {
      const res = await apiFetch('/claims', {
        method: 'POST',
        body: JSON.stringify({ claim_type: selectedType, quantity: qty }),
      }, router)
      if (!res || !res.ok) {
        const e = await res?.json()
        push('error', 'Claim failed', e?.detail || 'Something went wrong.')
        return
      }
      const data = await res.json()
      setCredits(c => c - cost)
      setHistory(h => [data.claim, ...h])

      const uRes = await apiFetch('/users/me', {}, router)
      if (uRes?.ok) { const u = await uRes.json(); setUser(u); setCredits(u.credits) }


      push('success', 'Claim placed', `${qty} ${selectedType === 'chance_drop' ? 'Chance Drop' : 'Assured Boost'} claim${qty > 1 ? 's' : ''} queued.`)
      setSelectedType(null); setQty(1)
    } finally { setLoading(false) }
  }

  return (
    <div className="view active">
      <div className="page-header">
        <h1>Snipe Claims</h1>
        <p>Choose your claim type, set your quantity, and confirm. Credits are deducted instantly.</p>
      </div>

      <div className="claim-grid">
        {[
          { id:'chance_drop', icon:'fa-shuffle', color:'blue', badge:'3 Credits', title:'Chance Drop',
            desc:'A randomised snipe. You may receive Nitro Basic or full Nitro Boost. Great for building your Balance affordably.',
            checks:['Nitro Basic or Nitro Boost, randomised','Delivered instantly to your Balance','3 Credits = 1 claim'], popular: false },
          { id:'assured_boost', icon:'fa-bullseye', color:'purple', badge:'5 Credits', title:'Assured Boost',
            desc:'Targeted exclusively at full Nitro Boost codes. When it lands, it is always Nitro Boost. No chance, no compromise.',
            checks:['Guaranteed full Nitro Boost only','Priority claim queue','5 credits = 1 targeted claim'], popular: true },
        ].map(c => (
          <div key={c.id} className={`claim-card ${c.color} ${selectedType === c.id ? 'selected' : ''} ${c.popular ? 'popular' : ''}`}
            onClick={() => setSelectedType(c.id)}>
            {c.popular && <span className="claim-popular-badge">Most Popular</span>}
            <span className={`claim-cost-badge ${c.color}`}>{c.badge}</span>
            <div className={`claim-card-icon ${c.color}`}><i className={`fa-solid ${c.icon}`} /></div>
            <h3>{c.title}</h3>
            <p>{c.desc}</p>
            {c.checks.map(ch => (
              <div className="claim-check" key={ch}>
                <i className="fa-solid fa-circle-check" style={{ color:'#30d158', fontSize:13 }} /> {ch}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:24, alignItems:'center', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--gray-500)', marginBottom:6 }}>Selected type</div>
            <div style={{ fontSize:'1rem', fontWeight:700, color:'var(--gray-900)' }}>
              {selectedType ? (selectedType === 'chance_drop' ? 'Chance Drop' : 'Assured Boost') + ` x${qty}` : 'Select a claim type above'}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--gray-500)', marginBottom:8 }}>Quantity</div>
              <div className="stepper">
                <button className="stepper-btn" onClick={() => setQty(q => Math.max(1, q - 1))}><i className="fa-solid fa-minus" style={{ fontSize:11 }} /></button>
                <div className="stepper-val">{qty}</div>
                <button className="stepper-btn" onClick={() => setQty(q => Math.min(50, q + 1))}><i className="fa-solid fa-plus" style={{ fontSize:11 }} /></button>
              </div>
            </div>
            <div>
              <div style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--gray-500)', marginBottom:4 }}>Total cost</div>
              <div style={{ fontSize:'1.375rem', fontWeight:700, color:'var(--nitro)' }}>
                {cost} <span style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--gray-500)' }}>credits</span>
              </div>
            </div>
            <button
              className="btn-nitro"
              onClick={confirmClaim}
              disabled={!selectedType || loading}
              style={{ opacity: selectedType ? 1 : 0.4, cursor: selectedType ? 'pointer' : 'not-allowed' }}
            >
              <i className="fa-solid fa-bolt" /> {loading ? 'Placing...' : 'Place Claim'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Analytics view ───────────────────────────────────────────────────────────

function ViewAnalytics({ history, credits }) {
  const boostCount = history.filter(h => h.claim_type === 'assured_boost').length
  const chanceCount = history.filter(h => h.claim_type === 'chance_drop').length

  const last8Weeks = Array.from({ length: 8 }, (_, i) => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - (7 * (7 - i)))
    const nextWeek = new Date(weekAgo); nextWeek.setDate(nextWeek.getDate() + 7)
    return history.filter(h => {
      const d = new Date(h.created_at)
      return d >= weekAgo && d < nextWeek
    }).reduce((sum, h) => sum + h.credits_spent, 0)
  })

  return (
    <div className="view active">
      <div className="page-header">
        <h1>Balance Analytics</h1>
        <p>Your full Nitro history, delivery patterns, and credit flow at a glance.</p>
      </div>
      <div className="analytics-grid">
        <div className="card analytics-wide">
          <div style={{ fontSize:'1rem', fontWeight:600, color:'var(--gray-900)', marginBottom:4 }}>Claims over time</div>
          <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)', marginBottom:20 }}>Total claims by week, last 8 weeks</div>
          <div className="chart-wrap" style={{ height:260 }}>
            <Bar
              data={{
                labels: ['Week 1','Week 2','Week 3','Week 4','Week 5','Week 6','Week 7','Week 8'],
                datasets: [{
                  data: last8Weeks,
                  backgroundColor: 'rgba(88,101,242,0.12)',
                  borderColor: 'rgba(88,101,242,0.7)',
                  borderWidth: 1.5, borderRadius: 6, borderSkipped: false,
                }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false }, border: { display: false } },
                  y: { grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { stepSize: 1 } }
                }
              }}
            />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize:'1rem', fontWeight:600, marginBottom:4 }}>Claim breakdown</div>
          <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)', marginBottom:20 }}>By type, all time</div>
          <div className="chart-wrap" style={{ height:200 }}>
            <Doughnut
              data={{
                labels: ['Assured Boost','Chance Drop'],
                datasets: [{ data: [boostCount || 1, chanceCount || 1], backgroundColor: ['#5865f2','#0071e3'], borderWidth: 0, hoverOffset: 4 }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false, cutout: '68%',
                plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 8 } } }
              }}
            />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize:'1rem', fontWeight:600, marginBottom:4 }}>Credits spent</div>
          <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)', marginBottom:20 }}>Weekly spend, last 8 weeks</div>
          <div className="chart-wrap" style={{ height:200 }}>
            <Bar
              data={{
                labels: ['Wk1','Wk2','Wk3','Wk4','Wk5','Wk6','Wk7','Wk8'],
                datasets: [{
                  data: last8Weeks,
                  backgroundColor: 'rgba(0,113,227,0.12)',
                  borderColor: 'rgba(0,113,227,0.6)',
                  borderWidth: 1.5, borderRadius: 5, borderSkipped: false,
                }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false }, border: { display: false } },
                  y: { grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { callback: v => v + ' CR' } }
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Gifting view ─────────────────────────────────────────────────────────────

function ViewGifting({ credits, setCredits, push, router, setHistory }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [giftQty, setGiftQty] = useState(3)
  const [loading, setLoading] = useState(false)
  const searchTimer = useRef(null)
  
  const [anonymous, setAnonymous] = useState(false)

  async function doSearch(val) {
    if (!val.trim()) { setResults([]); return }
    const res = await apiFetch(`/users/search?q=${encodeURIComponent(val)}`, {}, router)
    if (res?.ok) setResults(await res.json())
  }

  function handleSearch(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(val), 300)
  }

  function adjustGift(delta) {
    setGiftQty(q => {
      const next = Math.round((q + delta) / 3) * 3
      return Math.max(3, Math.min(credits, next))
    })
  }

  async function confirmGift() {
    if (!selected) return
    if (credits < giftQty) { push('error', 'Insufficient Credits', 'Not enough credits.'); return }
    setLoading(true)
    try {
      const res = await apiFetch('/gifts', {
        method: 'POST',
        body: JSON.stringify({
            recipient_discord_id: selected.discord_id,
            credits_sent: giftQty,
            anonymous,
        }),
      }, router)
      if (!res?.ok) { const e = await res?.json(); push('error', 'Gift failed', e?.detail || 'Something went wrong.'); return }
      setCredits(c => c - giftQty)


      const hRes = await apiFetch('/claims/me', {}, router)
      if (hRes?.ok) setHistory(await hRes.json())

      push('success', 'Gift sent', `${giftQty / 3} month${giftQty / 3 > 1 ? 's' : ''} of Nitro sent to ${selected.username}.`)
      setSelected(null); setSearch(''); setResults([]); setGiftQty(3)
    } finally { setLoading(false) }
  }

  const months = giftQty / 3
  const ready = selected && giftQty >= 3 && giftQty <= credits

  return (
    <div className="view active">
      <div className="page-header">
        <h1>Nitro Gifting</h1>
        <p>Send Nitro months from your Balance directly to any Discord user.</p>
      </div>
      <div className="gift-layout">
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          <div className="card">
            <div style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--gray-900)', marginBottom:18 }}>Find recipient</div>
            <div className="form-group">
              <label className="form-label">Discord username</label>
              <div style={{ position:'relative' }}>
                <input className="form-input" type="text" placeholder="e.g. phantomgrid"
                  value={search} onChange={e => handleSearch(e.target.value)} />
                <i className="fa-solid fa-magnifying-glass" style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', color:'var(--gray-300)', fontSize:13, pointerEvents:'none' }} />
              </div>
            </div>
            <div>
              {results.map(u => (
                <div key={u.discord_id} className={`search-result ${selected?.discord_id === u.discord_id ? 'selected' : ''}`}
                  onClick={() => setSelected(u)}>
                  <img className="sr-avatar" src={u.avatar_url || `https://cdn.discordapp.com/embed/avatars/0.png`} alt={u.username} />
                  <div>
                    <div className="sr-name">{u.username}</div>
                    <div className="sr-tag"><i className="fa-brands fa-discord" style={{ fontSize:11, color:'var(--nitro)', marginRight:4 }} />Discord Member</div>
                  </div>
                  <i className="fa-solid fa-circle-check sr-check" />
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--gray-900)', marginBottom:18 }}>Amount to gift</div>
            <div className="form-group">
              <label className="form-label">Credits to send</label>
              <div className="stepper" style={{ width:'100%', borderRadius:'var(--radius-md)' }}>
                <button className="stepper-btn" onClick={() => adjustGift(-3)}><i className="fa-solid fa-minus" style={{ fontSize:11 }} /></button>
                <div className="stepper-val" style={{ flex:1, fontSize:'1.125rem' }}>{giftQty}</div>
                <button className="stepper-btn" onClick={() => adjustGift(3)}><i className="fa-solid fa-plus" style={{ fontSize:11 }} /></button>
              </div>
              <div className="form-hint">{giftQty} credits = {months} month{months !== 1 ? 's' : ''} of Nitro</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ position:'sticky', top:'calc(60px + 20px)' }}>
          <div style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--gray-900)', marginBottom:18 }}>Gift summary</div>
          <div style={{ display:'flex', alignItems:'center', gap:14, padding:14, background:'var(--gray-50)', borderRadius:'var(--radius-md)', border:'0.5px solid var(--gray-100)', marginBottom:16 }}>
            <img src={selected?.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'} alt=""
              style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover', opacity: selected ? 1 : 0.3, transition:'opacity 0.3s' }} />
            <div>
              <div style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--gray-900)' }}>{selected?.username || 'No recipient selected'}</div>
              <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)' }}>{selected ? 'Discord Member' : 'Search for a user above'}</div>
            </div>
          </div>
          <div className="gift-summary">
            {[
              ['Credits to send', giftQty],
              ['Nitro months', `${months} month${months !== 1 ? 's' : ''}`],
              ['Your remaining balance', `${credits - giftQty} credits`],
            ].map(([k, v]) => (
              <div className="gift-summary-row" key={k}><span>{k}</span><span>{v}</span></div>
            ))}
            <div className="gift-summary-row total"><span>Sending</span><span style={{ color:'var(--nitro)' }}>{giftQty} credits</span></div>
          
          </div>
          <div className="gift-anon-row">
            <div>
              <h4>Send anonymously</h4>
              <p>Recipient won't see your username</p>
            </div>
            <button className={`toggle ${anonymous ? 'on' : ''}`} onClick={() => setAnonymous(a => !a)} />
          </div>
          <button className="btn-nitro" onClick={confirmGift} disabled={!ready || loading}
            style={{ width:'100%', justifyContent:'center', marginTop:16, opacity: ready ? 1 : 0.4, cursor: ready ? 'pointer' : 'not-allowed' }}>
            <i className="fa-solid fa-paper-plane" /> {loading ? 'Sending...' : 'Send Gift'}
          </button>
          <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)', textAlign:'center', marginTop:10 }}>Gift is instant and non-refundable.</div>
        </div>
      </div>
    </div>
  )
}

// ─── History view ─────────────────────────────────────────────────────────────

function ViewHistory({ history }) {
  return (
    <div className="view active">
      <div className="page-header">
        <h1>Snipe History</h1>
        <p>Every claim, gift, and credit event on your account.</p>
      </div>
      <div className="card">
        <table className="history-table">
          <thead>
            <tr>
              <th>Type</th><th>Details</th><th>Credits</th><th>Status</th><th>Date</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}>
                <td>
                    <span className={`type-tag ${
                      h.claim_type === 'assured_boost' ? 'boost' :
                      h.claim_type === 'chance_drop' ? 'basic' :
                      h.claim_type === 'gift_sent' ? 'gift-sent' :
                      h.claim_type === 'gift_received' ? 'gift-received' : 'credit'
                    }`}>
                    {
                      h.claim_type === 'assured_boost' ? 'Assured Boost' :
                      h.claim_type === 'chance_drop' ? 'Chance Drop' :
                      h.claim_type === 'gift_sent' ? 'Gift Sent' :
                      h.claim_type === 'gift_received' ? `Received from ${h.sender_username || 'Anonymous'}` :
                      'Credit Bonus'
                    }
                  </span>
                </td>
                <td style={{ color:'var(--gray-700)' }}>x{h.quantity || 1}</td>
                <td style={{ fontWeight:600, color: h.credits_spent > 0 ? 'var(--gray-900)' : '#1a7f37' }}>
                  {h.credits_spent > 0 ? '-' : '+'}{Math.abs(h.credits_spent)}
                </td>
                <td>
                  <span className={`status-dot ${h.success ? 'ok' : 'err'}`} />
                  {h.success ? 'Delivered' : 'Failed'}
                </td>
                <td style={{ color:'var(--gray-500)' }}>{new Date(h.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:'40px 0', color:'var(--gray-500)' }}>No history yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Credits view ─────────────────────────────────────────────────────────────

function ViewCredits({ user, credits, router, setUser }) {
  const tierOrder = ['copper', 'silver', 'gold', 'diamond']
  const tierReqs  = [0, 10, 25, 50]
  const tierBonuses = ['Standard', '+5% bonus credits', '+12% bonus credits', '+20% bonus credits']
  const tierIdx = tierOrder.indexOf(user?.tier || 'copper')
  const nextTierReq = tierReqs[tierIdx + 1]
  const lifetimeClaims = user?.lifetime_claims || 0
  const prevTierReq = tierReqs[tierIdx] || 0
  const progress = nextTierReq
    ? Math.min(((lifetimeClaims - prevTierReq) / (nextTierReq - prevTierReq)) * 100, 100)
    : 100
  const nextBonus = Math.ceil(credits / 25) * 25
  const creditsToBonus = nextBonus - credits

  console.log('user object:', user)

  return (
    <div className="view active">
      <div className="page-header">
        <h1>Member Credits</h1>
        <p>Your loyalty tier, credit balance, and everything your status unlocks.</p>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }} className="credits-top-grid">
        <div className="balance-widget" style={{ boxShadow:'var(--shadow-md)' }}>
          <div className="bw-label">Credit Balance</div>
          <div className="bw-amount">
            <span className="bw-num" style={{ color:'var(--nitro)' }}>{credits}</span>
            <span className="bw-unit">Credits</span>
          </div>
          <div className="bw-sub">{creditsToBonus} credits until next loyalty bonus</div>
          <div className="bw-bar"><div className="bw-bar-fill" style={{ width: `${Math.min(((25 - creditsToBonus) / 25) * 100, 100)}%` }} /></div>
          <div className="bw-row">
            <span className="lbl">Next bonus</span>
            <span className="val">+3 credits at {nextBonus}</span>
          </div>
        </div>

        <div className="card">
          <div className="bw-label">Your Tier</div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <div style={{ width:48, height:48, borderRadius:14,
              background: ['#fdf8f0','#f6f6f8','#fffbeb','var(--nitro-light)'][tierIdx],
              border: `0.5px solid ${'#e8d5b7,#d2d2d7,#fcd34d,rgba(88,101,242,0.25)'.split(',')[tierIdx]}`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:20,
              color: ['#92400e','#636366','#b45309','#5865f2'][tierIdx] }}>
              <i className={`fa-solid fa-${['medal','shield','crown','gem'][tierIdx]}`} />
            </div>
            <div>
              <div style={{ fontSize:'1.375rem', fontWeight:700, color:['#92400e','#636366','#b45309','#5865f2'][tierIdx], letterSpacing:'-0.02em' }}>
                {(user?.tier || 'copper').charAt(0).toUpperCase() + (user?.tier || 'copper').slice(1)}
              </div>
              <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)' }}>{lifetimeClaims} lifetime claims</div>
            </div>
          </div>
          <div className="progress-bar" style={{ marginBottom:8 }}>
            <div className="progress-fill" style={{ width:`${progress}%` }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8125rem', color:'var(--gray-500)' }}>
            <span>{lifetimeClaims} claims</span>
            <span>{nextTierReq ? `${nextTierReq - lifetimeClaims} more to ${tierOrder[tierIdx + 1]}` : 'Max tier reached'}</span>
          </div>
          {tierIdx < 3 && (
            <div style={{ marginTop:16, padding:'12px 16px', background:'var(--nitro-light)', borderRadius:'var(--radius-md)', fontSize:'0.8125rem', color:'var(--nitro)', fontWeight:500 }}>
              <i className="fa-solid fa-gem" style={{ marginRight:6 }} />
              Reach Diamond at 50 claims to unlock double-fire sniping
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize:'1rem', fontWeight:600, color:'var(--gray-900)', marginBottom:20 }}>Tier by Lifetime Claims</div>
        <div className="tier-cards">
          {[
            { cls:'copper',  iconCls:'b', icon:'fa-medal',  name:'Copper',  req:'1 – 9 claims',   bonus:'Standard' },
            { cls:'silver',  iconCls:'s', icon:'fa-shield', name:'Silver',  req:'10 – 24 claims', bonus:'+5% bonus credits' },
            { cls:'gold',    iconCls:'g', icon:'fa-crown',  name:'Gold',    req:'25 – 49 claims', bonus:'+12% bonus credits' },
            { cls:'diamond', iconCls:'d', icon:'fa-gem',    name:'Diamond', req:'50+ claims',     bonus:'+20% bonus credits' },
          ].map(t => (
            <div key={t.cls} className={`tier-card ${t.cls}`}>
              <div className="tier-left">
                <div className={`tier-icon ${t.iconCls}`}><i className={`fa-solid ${t.icon}`} /></div>
                <div>
                  <div className="tier-name">{t.name}</div>
                  <div className="tier-req">{t.req}</div>
                </div>
              </div>
              <div className="tier-bonus">{t.bonus}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Settings view ────────────────────────────────────────────────────────────

function ViewSettings({ push, onLogout }) {
  const [toggles, setToggles] = useState({
    claim_notifs: true, low_credit: true, failed_snipe: false, loyalty_bonus: true, auto_restock: false,
  })

  function toggle(key) {
    setToggles(t => ({ ...t, [key]: !t[key] }))
    if (key === 'auto_restock') push('info', 'Auto Restock', 'This feature is coming soon.')
  }

  const Row = ({ label, desc, k }) => (
    <div className="settings-row">
      <div><h4>{label}</h4><p>{desc}</p></div>
      <button className={`toggle ${toggles[k] ? 'on' : ''}`} onClick={() => toggle(k)} />
    </div>
  )

  return (
    <div className="view active">
      <div className="page-header"><h1>Settings</h1><p>Manage your Nitro Vault account preferences.</p></div>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <div className="card">
          <div style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--gray-900)', marginBottom:4 }}>Notifications</div>
          <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)', marginBottom:20 }}>Control how Nitro Vault communicates with you.</div>
          <div className="settings-grid">
            <Row label="Claim confirmations" desc="Notify me whenever a snipe lands in my Balance." k="claim_notifs" />
            <Row label="Low credit alert" desc="Alert when my credit balance drops below 10." k="low_credit" />
            <Row label="Failed snipe alerts" desc="Notify me if a claim attempt does not succeed." k="failed_snipe" />
            <Row label="Loyalty bonus alerts" desc="Tell me when free credits are added to my account." k="loyalty_bonus" />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:4 }}>Auto Restock</div>
          <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)', marginBottom:20 }}>Automatically top up credits when they run low.</div>
          <div className="settings-grid">
            <Row label="Enable Auto Restock" desc="Trigger a restock when credits fall below your threshold." k="auto_restock" />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:4 }}>Account</div>
          <div className="settings-grid">
            <div className="settings-row">
              <div><h4>Discord account</h4><p>Connected via Discord OAuth.</p></div>
              <div className="btn-connected"><i className="fa-brands fa-discord" /> Connected</div>
            </div>
            <div className="settings-row">
              <div><h4>Sign out</h4><p>Sign out of this Nitro Vault account on this device.</p></div>
              <button className="btn-ghost" style={{ color:'var(--red)', borderColor:'rgba(255,59,48,0.2)' }} onClick={onLogout}>
                <i className="fa-solid fa-arrow-right-from-bracket" /> Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard page ──────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [credits, setCredits] = useState(0)
  const [history, setHistory] = useState([])
  const [view, setView] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const { notifs, push, dismiss } = useNotifications()

  // ── Auth guard + load user ──────────────────────────────────────────────────
  useEffect(() => {
    if (!checkSessionExpiry(router)) return

    async function load() {
      const res = await apiFetch('/users/me', {}, router)
      if (!res) return
      if (!res.ok) { router.replace('/login'); return }
      const data = await res.json()

      // Stamp the login time if this is a fresh session (came via OAuth redirect)
      if (!localStorage.getItem('nv_login_time')) {
        localStorage.setItem('nv_login_time', Date.now().toString())
      }

      setUser(data)
      setCredits(data.credits)

      const hRes = await apiFetch('/claims/me', {}, router)
      if (hRes?.ok) setHistory(await hRes.json())
      setLoading(false)

    }
    load()
  }, [])

  // ── Poll for pending order completion if returning from checkout ──────────
  useEffect(() => {
    const { purchase } = router.query
    if (purchase !== 'success') return

    let attempts = 0
    const poll = setInterval(async () => {
      attempts++
      const res = await apiFetch('/users/me', {}, router)
      if (res?.ok) {
        const data = await res.json()
        setCredits(data.credits)
        setUser(data)
      }
      if (attempts >= 10) clearInterval(poll)  // stop after ~20s
    }, 2000)

    return () => clearInterval(poll)
  }, [router.query])

  // ── Auto-refresh token every 12 minutes ────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      await fetch(`${API}/auth/refresh`, { method:'POST', credentials:'include' })
    }, 12 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function handleLogout() {
    await fetch(`${API}/auth/logout`, { method:'POST', credentials:'include' })
    localStorage.clear()
    router.replace('/login')
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--gray-50)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, borderRadius:'50%', border:'2.5px solid var(--gray-100)', borderTopColor:'var(--nitro)', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
        <div style={{ fontSize:'0.9375rem', color:'var(--gray-500)' }}>Loading your dashboard</div>
      </div>
    </div>
  )

  return (
    <>
      <Head>
        <title>Dashboard — Nitro Vault</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      </Head>

      <NotifContainer notifs={notifs} dismiss={dismiss} />

      <div className="shell">
        <Sidebar
          view={view} setView={setView} user={user}
          onLogout={handleLogout}
          open={sidebarOpen} onClose={() => setSidebarOpen(false)}
        />

        <main className="main">
            <Topbar
              view={view} credits={credits}
              onHamburger={() => setSidebarOpen(o => !o)}
              onNotifClick={() => push('info', 'Notifications', 'You have no new notifications.')}
              hasNotifs={notifs.length > 0}
            />
          <div className="content">
            <div className="content-inner">
              {view === 'overview'  && <ViewOverview user={user} credits={credits} history={history} setView={setView} push={push} />}
              {view === 'claims'    && <ViewClaims credits={credits} setCredits={setCredits} history={history} setHistory={setHistory} push={push} router={router} setUser={setUser} />}
              {view === 'analytics' && <ViewAnalytics history={history} credits={credits} />}
              {view === 'gifting'   && <ViewGifting credits={credits} setCredits={setCredits} push={push} router={router} setHistory={setHistory} />}
              {view === 'history'   && <ViewHistory history={history} />}
              {view === 'credits'   && <ViewCredits user={user} credits={credits} />}
              {view === 'purchase' && <ViewPurchase push={push} />}
              {view === 'settings'  && <ViewSettings push={push} onLogout={handleLogout} />}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}





// ─── Purchase Credits view ────────────────────────────────────────────────────

const QUICK_AMOUNTS = [10, 25, 50, 100, 250]
const MIN_AMOUNT = 3
const MAX_AMOUNT = 500

function ViewPurchase({ push }) {
  const [amount, setAmount] = useState(25)
  const [method, setMethod] = useState('card')
  const [loading, setLoading] = useState(false)
  const [displayAmount, setDisplayAmount] = useState(25)
  const animFrame = useRef(null)

  const router = useRouter()

  const cryptoBonus = method === 'crypto' ? Math.floor(amount * 0.1) : 0
  const totalCredits = amount + cryptoBonus

  useEffect(() => {
    cancelAnimationFrame(animFrame.current)
    const start = displayAmount
    const end = totalCredits
    const duration = 280
    let t0 = null
    function tick(ts) {
      if (!t0) t0 = ts
      const p = Math.min((ts - t0) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setDisplayAmount(Math.round(start + (end - start) * ease))
      if (p < 1) animFrame.current = requestAnimationFrame(tick)
    }
    animFrame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrame.current)
  }, [amount, method])

  function setClamped(val) {
    const n = Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, Math.round(val) || 0))
    setAmount(n)
  }

  async function handlePurchase() {
    setLoading(true)
    try {
      const res = await apiFetch('/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ credits: amount, method }),
      }, router)
      if (!res?.ok) {
        const e = await res?.json()
        push('error', 'Could not start checkout', e?.detail || 'Something went wrong.')
        setLoading(false)
        return
      }
      const data = await res.json()
      window.location.href = data.checkout_url
    } catch {
      push('error', 'Network error', 'Could not reach the server.')
      setLoading(false)
    }
  }

  const months = Math.floor(amount / 3)
  const pct = ((amount - MIN_AMOUNT) / (MAX_AMOUNT - MIN_AMOUNT)) * 100

  return (
    <div className="view active">
      <div className="page-header">
        <h1>Purchase Credits</h1>
        <p>Top up your balance instantly. 1 credit = $1. Pay with card or crypto.</p>
      </div>

      <div className="purchase-layout">
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* Amount picker */}
          <div className="card purchase-amount-card">
            <div style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--gray-900)', marginBottom:6 }}>Choose an amount</div>
            <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)', marginBottom:24 }}>Between {MIN_AMOUNT} and {MAX_AMOUNT} credits</div>

            <div className="amount-display">
              <input
                className="amount-input"
                type="number"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                value={amount}
                onChange={e => setClamped(e.target.value)}
                onBlur={e => setClamped(e.target.value)}
              />
              <span className="amount-suffix-wrap">
                <i className="fa-solid fa-gem amount-gem" />
                <span className="amount-suffix">credits</span>
              </span>
            </div>

            <div className="amount-slider-wrap">
              <input
                type="range"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                value={amount}
                onChange={e => setClamped(e.target.value)}
                className="amount-slider"
                style={{ '--pct': `${pct}%` }}
              />
              <div className="amount-slider-labels">
                <span>${MIN_AMOUNT}</span>
                <span>${MAX_AMOUNT}</span>
              </div>
            </div>

            <div className="quick-amount-row">
              {QUICK_AMOUNTS.map(q => (
                <button
                  key={q}
                  className={`quick-amount-btn ${amount === q ? 'active' : ''}`}
                  onClick={() => setClamped(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div className="card">
            <div style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--gray-900)', marginBottom:18 }}>Payment method</div>
            <div className="payment-method-grid">
              <div
                className={`payment-method-card ${method === 'card' ? 'selected' : ''}`}
                onClick={() => setMethod('card')}
              >
                <div className="pm-icon card"><i className="fa-solid fa-credit-card" /></div>
                <div>
                  <div className="pm-title">Credit Card</div>
                  <div className="pm-sub">via Stripe · instant</div>
                </div>
                <i className="fa-solid fa-circle-check pm-check" />
              </div>
              <div
                className={`payment-method-card ${method === 'crypto' ? 'selected' : ''}`}
                onClick={() => setMethod('crypto')}
              >
                <div className="pm-icon crypto"><i className="fa-brands fa-bitcoin" /></div>
                <div>
                  <div className="pm-title">Crypto <span className="pm-bonus-tag">+10% bonus</span></div>
                  <div className="pm-sub">BTC, ETH, USDT · 1 confirmation</div>
                </div>
                <i className="fa-solid fa-circle-check pm-check" />
              </div>
            </div>
          </div>
        </div>

        {/* Order summary */}
        <div className="card" style={{ position:'sticky', top:'calc(60px + 20px)' }}>
          <div style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--gray-900)', marginBottom:18 }}>Order summary</div>

          <div className="purchase-summary-hero">
            <i className="fa-solid fa-gem" />
            <div className="psh-num">{displayAmount}</div>
            <div className="psh-label">Credits</div>
          </div>

          <div className="gift-summary" style={{ marginTop: 16 }}>
            <div className="gift-summary-row"><span>Credits</span><span>{amount}</span></div>
            {cryptoBonus > 0 && (
              <div className="gift-summary-row bonus-row">
                <span><i className="fa-solid fa-sparkles" style={{ fontSize: 11, marginRight: 5 }} />Crypto bonus (+10%)</span>
                <span>+{cryptoBonus}</span>
              </div>
            )}
            <div className="gift-summary-row"><span>Nitro months</span><span>{months} month{months !== 1 ? 's' : ''}</span></div>
            <div className="gift-summary-row"><span>Payment method</span><span>{method === 'card' ? 'Credit Card' : 'Crypto'}</span></div>
            <div className="gift-summary-row total"><span>Total</span><span style={{ color:'var(--nitro)' }}>${amount}</span></div>
          </div>

          <button
            className="btn-nitro"
            onClick={handlePurchase}
            disabled={loading || amount < MIN_AMOUNT}
            style={{ width:'100%', justifyContent:'center', marginTop:16 }}
          >
            <i className={`fa-solid ${method === 'card' ? 'fa-lock' : 'fa-bitcoin-sign'}`} />
            {loading ? 'Processing...' : `Pay $${amount}`}
          </button>
          <div style={{ fontSize:'0.8125rem', color:'var(--gray-500)', textAlign:'center', marginTop:10 }}>
            Secure checkout. Credits land instantly after payment confirms.
          </div>
        </div>
      </div>
    </div>
  )
}