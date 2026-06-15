import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Image from 'next/image'

// ─── Data ────────────────────────────────────────────────────────────────────

const HOW_CARDS = [
  {
    icon: 'fa-solid fa-satellite-dish',
    color: 'purple',
    title: 'Always scanning',
    body: 'Our bots continuously scan hundreds of Discord servers for freshly generated Nitro gift codes, with sub-50ms reaction times.',
  },
  {
    icon: 'fa-solid fa-bolt',
    color: 'blue',
    title: 'Lightning-fast claim',
    body: 'The moment a valid code appears, it is claimed automatically, before anyone else can react. You do not lift a finger.',
  },
  {
    icon: 'fa-solid fa-piggy-bank',
    color: 'green',
    title: 'Lands in your Balance',
    body: 'Every sniped Nitro flows straight into your personal Nitro Balance. Redeem it, gift it, or let it stack. On your terms.',
  },
  {
    icon: 'fa-solid fa-shield-halved',
    color: 'amber',
    title: 'Safe by design',
    body: 'We never ask for your password. The Nitro Balance system is the same mechanism Discord uses internally. No risk to your account.',
  },
]

const TIERS = [
  { cls: 'copper',  iconCls: 'b', icon: 'fa-solid fa-medal',  name: 'Copper',  req: '1 – 9 claims',    bonus: 'Standard' },
  { cls: 'silver',  iconCls: 's', icon: 'fa-solid fa-shield', name: 'Silver',  req: '10 – 24 claims',  bonus: '+5% bonus credits' },
  { cls: 'gold',    iconCls: 'g', icon: 'fa-solid fa-crown',  name: 'Gold',    req: '25 – 49 claims',  bonus: '+12% bonus credits' },
  { cls: 'diamond', iconCls: 'd', icon: 'fa-solid fa-gem',    name: 'Diamond', req: '50+ claims',      bonus: '+20% bonus credits' },
]

const PERKS = [
  {
    iconCls: '',
    icon: 'fa-solid fa-rotate-right',
    title: 'Failed snipe refund',
    body: 'If a claim attempt fails for any reason, the credit is returned to your account automatically. No questions, no forms.',
    diamond: false,
  },
  {
    iconCls: '',
    icon: 'fa-solid fa-calendar-check',
    title: 'Loyalty Credit Bonus',
    body: 'For every 25 credits you add, we automatically top up your account with 3 extra credits. Our way of saying thank you.',
    diamond: false,
  },
  {
    iconCls: '',
    icon: 'fa-solid fa-user-shield',
    title: 'Dedicated support',
    body: 'Silver and above members get a private support channel with a guaranteed one-hour response.',
    diamond: false,
  },
  {
    iconCls: 'diamond-icon',
    icon: 'fa-solid fa-gem',
    title: 'Diamond: double-fire sniping',
    body: 'Every claim you purchase fires two simultaneous snipe attempts. If both land, you keep both. Two chances. One credit. The highest hit rate we offer.',
    diamond: true,
  },
]

const TESTIMONIALS = [
  {
    username: 'voidwalker_.px',
    quote: 'Been using Nitro Vault for 6 months. My Nitro Balance is sitting at 9 months. Completely effortless. I literally forgot it was running.',
    stars: 5,
    seed: 1012,
  },
  {
    username: 'nachtfalter',
    quote: 'The Member Credits system is genuinely clever. Got a free month just from being loyal. Feels like a real perk, not a gimmick.',
    stars: 5,
    seed: 1025,
  },
  {
    username: 'sol.exe',
    quote: "I was skeptical at first but I've accumulated 4 months of Nitro without spending anything extra. The setup took 2 minutes.",
    stars: 5,
    seed: 1062,
  },
  {
    username: 'crystalline.arc',
    quote: 'Support answered in under an hour when I had a question. Diamond tier is actually worth it for the double-fire sniping alone.',
    stars: 5,
    seed: 1074,
  },
  {
    username: 'phantomgrid',
    quote: 'The balance system is brilliant. I do not have to decide immediately. I just let the months stack and redeem when I actually need them.',
    stars: 5,
    seed: 1084,
  },
]

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Calculates total Nitros delivered: base 353 + 5 per day since 2025-01-01 GMT+1 */
function useTotalNitros() {
  const [count, setCount] = useState(353)

  useEffect(() => {
    const BASE = 353
    const BASE_DATE = new Date('2025-01-01T00:00:00+01:00')
    const nowGMT1 = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })
    )
    const daysDiff = Math.floor((nowGMT1 - BASE_DATE) / 86400000)
    const total = BASE + Math.max(0, daysDiff) * 5
    const from = Math.max(0, total - 80)
    const duration = 1600
    let start = null

    function tick(ts) {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(from + (total - from) * ease))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [])

  return count
}

/** Adds 'scrolled' class to nav after 30px scroll */
function useNavScroll(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = () => el.classList.toggle('scrolled', window.scrollY > 30)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [ref])
}

/** IntersectionObserver scroll-reveal with optional stagger delay */
function useReveal(selector, stagger = false) {
  useEffect(() => {
    const els = document.querySelectorAll(selector)
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const delay = stagger ? Number(entry.target.dataset.delay || 0) * 80 : 0
          setTimeout(() => entry.target.classList.add('visible'), delay)
          io.unobserve(entry.target)
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach((el, i) => {
      if (stagger) el.dataset.delay = i
      io.observe(el)
    })
    return () => io.disconnect()
  }, [selector, stagger])
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Nav() {
  const navRef = useRef(null)
  useNavScroll(navRef)

  return (
    <nav ref={navRef} className="nav" id="main-nav">
      <div className="nav-inner">
        <a className="nav-logo" href="#">
          <img src="/Logo.png" alt="Nitro Vault" />
        </a>
        <ul className="nav-links">
          <li><a href="#how-it-works">How It Works</a></li>
          <li><a href="#services">Services</a></li>
          <li><a href="#member-credits">Credits</a></li>
          <li><a href="#testimonials">Reviews</a></li>
        </ul>
        <a href="#services" className="nav-cta">Get Started</a>
        <button className="nav-hamburger" aria-label="Open menu">
          <i className="fa-solid fa-bars" style={{ fontSize: 18, color: 'var(--gray-700)' }} />
        </button>
      </div>
    </nav>
  )
}

function Hero({ count }) {
  return (
    <section className="hero" id="hero">
      <div className="container">
        <div className="hero-eyebrow">
          <span className="live-dot" />
          Live Service. Instant Delivery.
        </div>
        <h1 className="t-display hero-headline">
          <span className="count-num">{count.toLocaleString()}</span> Total Nitros
          <br />Delivered
        </h1>
        <p className="t-body hero-sub">
          The most trusted Discord Nitro sniping service. Fully automated. Goes straight to your personal Nitro Balance.
        </p>
        <div className="hero-actions">
          <a href="#services" className="btn-primary">
            <i className="fa-solid fa-bolt" />
            Start Sniping
          </a>
          <a href="#how-it-works" className="btn-secondary">
            Learn how it works
            <i className="fa-solid fa-chevron-right" style={{ fontSize: 12 }} />
          </a>
        </div>
        <div className="hero-stat-row">
          {[
            { num: '99.7%', lbl: 'Snipe success rate' },
            { num: '< 50ms', lbl: 'Average claim time' },
            { num: '24/7', lbl: 'Always watching' },
            { num: '4,200+', lbl: 'Happy members' },
          ].map(({ num, lbl }) => (
            <div className="hero-stat" key={lbl}>
              <div className="num">{num}</div>
              <div className="lbl">{lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  useReveal('.how-card', true)

  return (
    <section className="how-section" id="how-it-works">
      <div className="container">
        <div className="section-header">
          <p className="t-caption">The process</p>
          <h2 className="t-title" style={{ marginTop: 8 }}>
            Effortless.<br />Automatic. Yours.
          </h2>
          <p className="t-body" style={{ maxWidth: 480, marginTop: 14 }}>
            Our system monitors thousands of channels around the clock, captures freshly generated Nitro codes the moment they appear, and deposits them directly into your Nitro Balance. No manual work required.
          </p>
        </div>
        <div className="how-grid">
          {HOW_CARDS.map(({ icon, color, title, body }) => (
            <div className="how-card" key={title}>
              <div className={`how-icon ${color}`}>
                <i className={icon} />
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Services() {
  useReveal('#featured-card')
  useReveal('.reveal', true)

  return (
    <section className="services-section" id="services">
      <div className="container">

        <div className="section-header reveal">
          <p className="t-caption">Services</p>
          <h2 className="t-title" style={{ marginTop: 8 }}>
            One Balance.<br />Endless Nitro.
          </h2>
          <p className="t-body" style={{ maxWidth: 500, marginTop: 14 }}>
            Choose how you snipe. Every claim lands straight in your Nitro Balance. 3 credits equals one full month of Nitro.
          </p>
        </div>

        {/* Claim type cards */}
        <div className="claim-type-grid">
          {/* Chance Drop */}
          <div className="claim-card reveal">
            <span className="claim-cost-badge blue">1 Credit</span>
            <div className="claim-card-icon blue">
              <i className="fa-solid fa-shuffle" />
            </div>
            <h3>Chance Drop</h3>
            <p>A randomised snipe. You may receive Nitro Basic or full Nitro Boost. Great for building your Balance affordably.</p>
            <div className="claim-check"><i className="fa-solid fa-circle-check" /> Nitro Basic or Nitro Boost, randomised</div>
            <div className="claim-check"><i className="fa-solid fa-circle-check" /> Delivered instantly to your Balance</div>
            <div className="claim-check"><i className="fa-solid fa-circle-check" /> 1 credit = 1 claim</div>
            <div className="claim-card-cost" style={{ marginTop: 16 }}>
              <i className="fa-solid fa-gem" /> 1 credit per claim
            </div>
          </div>

          {/* Assured Boost */}
          <div className="claim-card popular reveal">
            <span className="claim-popular-badge">Most Popular</span>
            <span className="claim-cost-badge purple">5 Credits</span>
            <div className="claim-card-icon purple">
              <i className="fa-solid fa-bullseye" />
            </div>
            <h3>Assured Boost</h3>
            <p>Targeted exclusively at full Nitro Boost codes. When it lands, it is always Nitro Boost. No chance, no compromise.</p>
            <div className="claim-check">
              <i className="fa-solid fa-circle-check" />
              <strong style={{ color: 'var(--gray-700)' }}>Guaranteed</strong> full Nitro Boost only
            </div>
            <div className="claim-check"><i className="fa-solid fa-circle-check" /> Priority claim queue</div>
            <div className="claim-check"><i className="fa-solid fa-circle-check" /> 5 credits = 1 targeted claim</div>
            <div className="claim-card-cost" style={{ marginTop: 16 }}>
              <i className="fa-solid fa-gem" /> 5 credits per claim
            </div>
          </div>
        </div>

        {/* Featured Nitro Balance card */}
        <div className="featured-card" id="featured-card">
          <div className="featured-left">
            <div>
              <div className="featured-badge">
                <i className="fa-solid fa-star" style={{ fontSize: 10 }} />
                Featured Service
              </div>
              <h2>Nitro Balance</h2>
              <p>
                Sniped Nitro lands in your personal Balance automatically. Redeem on your terms, apply it to your own subscription, gift it to a friend, or let months accumulate. Your Nitro, your rules.
                <br /><br />
                <span style={{ fontSize: '0.875rem', color: 'var(--gray-300)' }}>3 credits = 1 month of Nitro</span>
              </p>
            </div>
            <div className="featured-actions">
              <a href="#" className="btn-nitro">
                <i className="fa-solid fa-wallet" />
                Redeem Now
              </a>
              <a href="#" className="btn-link">
                Learn more <i className="fa-solid fa-arrow-right" style={{ fontSize: 12 }} />
              </a>
            </div>
          </div>
          <div className="featured-right">
            <div className="balance-widget">
              <div className="bw-label">Nitro Balance</div>
              <div className="bw-amount">
                <span className="bw-num">3</span>
                <span className="bw-unit">Months</span>
              </div>
              <div className="bw-sub">approximately 90 days of Nitro available</div>
              <div className="balance-bar">
                <div className="balance-bar-fill" />
              </div>
              <div className="balance-row">
                <span className="br-label">Next delivery</span>
                <span className="br-value">Automatic</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature stubs */}
        <div className="services-more" style={{ marginTop: 16 }}>
          {[
            {
              available: true,
              icon: 'fa-solid fa-gift',
              name: 'Nitro Gifting',
              desc: 'Send Nitro months to friends directly from your Balance.',
              status: 'Available Now',
              statusColor: '#30d158',
            },
            {
              available: true,
              icon: 'fa-solid fa-chart-line',
              name: 'Balance Analytics',
              desc: 'Track your Nitro history, delivery schedule, and savings over time.',
              status: 'Available Now',
              statusColor: '#30d158',
            },
            {
              available: false,
              icon: 'fa-solid fa-rotate',
              name: 'Auto Restock',
              desc: 'Set a minimum Balance threshold and we top up your credits automatically when you run low.',
              status: 'Coming Soon',
              statusColor: 'var(--gray-300)',
            },
          ].map(({ available, icon, name, desc, status, statusColor }) => (
            <div
              key={name}
              className={`service-stub reveal ${available ? 'available' : 'coming'}`}
            >
              <i
                className={`${icon} stub-icon`}
                style={{ color: available ? 'var(--nitro)' : 'var(--gray-300)' }}
              />
              <p
                className="stub-name"
                style={{ color: available ? 'var(--gray-700)' : 'var(--gray-400)' }}
              >
                {name}
              </p>
              <p
                className="stub-desc"
                style={{ color: available ? 'var(--gray-500)' : 'var(--gray-300)' }}
              >
                {desc}
              </p>
              <span className="stub-status" style={{ color: statusColor }}>
                {status}
              </span>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}

function MemberCredits() {
  useReveal('.loyalty-visual', false)
  useReveal('.loyalty-text', false)

  return (
    <section className="loyalty-section" id="member-credits">
      <div className="container">
        <div className="section-header reveal">
          <p className="t-caption">Member Credits</p>
          <h2 className="t-title" style={{ marginTop: 8 }}>
            The more you claim,<br />the more you earn.
          </h2>
          <p className="t-body" style={{ maxWidth: 480, marginTop: 14 }}>
            Your tier is determined by the total lifetime claims purchased on your account. More claims means a higher tier, and higher tiers unlock better perks, bonuses, and priority access automatically.
          </p>
        </div>
        <div className="loyalty-grid">

          {/* Tier cards */}
          <div className="loyalty-visual reveal">
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-500)', marginBottom: 20, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Tier by Lifetime Claims
            </p>
            <div className="tier-cards">
              {TIERS.map(({ cls, iconCls, icon, name, req, bonus }) => (
                <div className={`tier-card ${cls}`} key={name}>
                  <div className="tier-left">
                    <div className={`tier-icon ${iconCls}`}>
                      <i className={icon} />
                    </div>
                    <div>
                      <div className="tier-name">{name}</div>
                      <div className="tier-req">{req}</div>
                    </div>
                  </div>
                  <div className="tier-bonus">{bonus}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Perks */}
          <div className="loyalty-text reveal">
            <h3 className="t-section">Everything Credits unlock</h3>
            <ul className="loyalty-perks">
              {PERKS.map(({ iconCls, icon, title, body, diamond }) => (
                <li key={title}>
                  <div className={`perk-icon ${iconCls}`}>
                    <i className={icon} style={{ fontSize: 12, ...(iconCls === 'diamond-icon' ? { color: 'white' } : {}) }} />
                  </div>
                  <div className="perk-text">
                    <h4 className={diamond ? 'nitro' : ''}>{title}</h4>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </section>
  )
}

function Testimonials() {
  useReveal('.testi-card', true)

  return (
    <section className="testimonials-section" id="testimonials">
      <div className="container">
        <div className="section-header reveal" style={{ textAlign: 'center' }}>
          <p className="t-caption">Community</p>
          <h2 className="t-title" style={{ marginTop: 8 }}>Loved by the Community</h2>
          <p className="t-body" style={{ maxWidth: 460, margin: '14px auto 0' }}>
            Thousands of Discord users trust their Nitro Balance to Nitro Vault. Here is what a few of them have to say.
          </p>
        </div>
        <div className="testimonials-grid">
          {TESTIMONIALS.map(({ username, quote, stars, seed }) => (
            <div className="testi-card" key={username}>
              <div className="testi-stars">
                {Array.from({ length: stars }).map((_, i) => (
                  <i className="fa-solid fa-star" key={i} />
                ))}
              </div>
              <p className="testi-quote">"{quote}"</p>
              <div className="testi-author">
                <img
                  className="testi-avatar"
                  src={`https://picsum.photos/seed/${seed}/80/80`}
                  alt={username}
                />
                <div>
                  <div className="testi-name">{username}</div>
                  <div className="testi-tag">
                    <i className="fa-brands fa-discord" />
                    Discord Member
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TrustBar() {
  const badges = [
    { icon: 'fa-solid fa-lock',           label: 'Zero credential access' },
    { icon: 'fa-solid fa-clock-rotate-left', label: '24/7 automated delivery' },
    { icon: 'fa-solid fa-circle-check',   label: 'Verified by 4,200+ members' },
    { icon: 'fa-solid fa-headset',        label: 'Live support on Discord' },
  ]
  return (
    <section className="trust-section">
      <div className="container">
        <h2 className="t-title">Built on trust.<br />Designed for peace of mind.</h2>
        <p className="t-body">No passwords. No personal data. Just Nitro in your Balance.</p>
        <div className="trust-badges">
          {badges.map(({ icon, label }) => (
            <div className="trust-badge" key={label}>
              <i className={icon} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a className="nav-logo" href="#" style={{ display: 'inline-flex' }}>
              <img src="/Logo.png" alt="Nitro Vault" style={{ height: 36, width: 'auto' }} />
            </a>
            <p>The premium Discord Nitro sniping service. Automated, secure, and built for the community.</p>
          </div>
          <div className="footer-col">
            <h4>Services</h4>
            <ul>
              <li><a href="#">Nitro Balance</a></li>
              <li><a href="#">Member Credits</a></li>
              <li><a href="#">Nitro Gifting</a></li>
              <li><a href="#">Auto Restock</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Support</h4>
            <ul>
              <li><a href="#">Documentation</a></li>
              <li><a href="#">Discord Server</a></li>
              <li><a href="#">Status Page</a></li>
              <li><a href="#">Contact</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Refund Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>Copyright &copy; 2025 Nitro Vault. All rights reserved.</p>
          <div className="footer-socials">
            <a href="#" aria-label="Discord"><i className="fa-brands fa-discord" /></a>
            <a href="#" aria-label="Twitter/X"><i className="fa-brands fa-x-twitter" /></a>
            <a href="#" aria-label="GitHub"><i className="fa-brands fa-github" /></a>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  const count = useTotalNitros()

  return (
    <>
      <Head>
        <title>Nitro Vault — Premium Discord Nitro Balance</title>
        <meta name="description" content="The most trusted Discord Nitro sniping service. Fully automated. Lands straight in your personal Nitro Balance." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      </Head>

      <Nav />
      <Hero count={count} />
      <HowItWorks />
      <Services />
      <MemberCredits />
      <Testimonials />
      <TrustBar />
      <Footer />
    </>
  )
}
