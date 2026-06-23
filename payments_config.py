"""
payments_config.py — Nitro Vault payment provider configuration

Add a new provider by:
  1. Adding its env vars below
  2. Adding an entry to PROVIDERS
  3. Implementing create_checkout() + webhook handling in main.py
"""

import os

# ─── Stripe ──────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY      = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET  = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# ─── CoinGate ────────────────────────────────────────────────────────────────
COINGATE_API_TOKEN       = os.environ.get("COINGATE_API_TOKEN", "")
COINGATE_CALLBACK_SECRET = os.environ.get("COINGATE_CALLBACK_SECRET", "")  # signs our own callback_url token
COINGATE_SANDBOX          = os.environ.get("COINGATE_SANDBOX", "true").lower() == "true"
COINGATE_API_BASE         = (
    "https://api-sandbox.coingate.com/v2" if COINGATE_SANDBOX
    else "https://api.coingate.com/v2"
)

# ─── General ─────────────────────────────────────────────────────────────────
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# 1 credit = $1, matches your existing ViewPurchase assumption
CREDIT_TO_USD = 1.0
MIN_CREDITS   = 3
MAX_CREDITS   = 500
CRYPTO_BONUS_PCT = 0.10  # matches the +10% bonus already shown in the frontend

# ─── Provider registry ───────────────────────────────────────────────────────
# `enabled` lets you flip a provider off without removing code/routes.
PROVIDERS = {
    "card": {
        "label": "Credit Card",
        "driver": "stripe",
        "enabled": bool(STRIPE_SECRET_KEY),
    },
    "crypto": {
        "label": "Crypto",
        "driver": "coingate",
        "enabled": bool(COINGATE_API_TOKEN),
        "bonus_pct": CRYPTO_BONUS_PCT,
    },
}


def is_enabled(method: str) -> bool:
    p = PROVIDERS.get(method)
    return bool(p and p["enabled"])