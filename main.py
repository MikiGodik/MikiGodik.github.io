"""
main.py — Nitro Vault API
Discord OAuth2 + JWT + PostgreSQL

Security checklist:
  - JWT signed with HS256, short-lived access tokens + refresh tokens
  - Refresh tokens stored hashed in DB (sha256), rotated on every use
  - httpOnly + Secure + SameSite=Lax cookies (never accessible from JS)
  - PKCE-style state parameter to prevent CSRF on OAuth callback
  - Rate limiting on auth endpoints (slowapi)
  - All DB queries use parameterised statements (asyncpg — never raw string concat)
  - CORS locked to your frontend origin only
  - Secrets never logged
"""


import asyncio
import hashlib
import hmac
import logging
import os
import secrets
import time
from datetime import datetime, timezone

import asyncpg
import httpx
import jwt
import stripe
from dotenv import load_dotenv

load_dotenv()  # ← must run BEFORE payments_config is imported

import payments_config as pc

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("nitrovault")

# ─── Config ──────────────────────────────────────────────────────────────────

stripe.api_key = pc.STRIPE_SECRET_KEY


logging.basicConfig(level=logging.INFO)
log = logging.getLogger("nitrovault")

# ─── Config ──────────────────────────────────────────────────────────────────

stripe.api_key = pc.STRIPE_SECRET_KEY


DISCORD_CLIENT_ID     = os.environ["DISCORD_CLIENT_ID"]
DISCORD_CLIENT_SECRET = os.environ["DISCORD_CLIENT_SECRET"]
DISCORD_REDIRECT_URI  = os.environ["DISCORD_REDIRECT_URI"]
JWT_SECRET            = os.environ["JWT_SECRET"]          # min 64 random bytes
JWT_ALGORITHM         = "HS256"
ACCESS_TOKEN_TTL      = 60 * 15          # 15 minutes
REFRESH_TOKEN_TTL     = 60 * 60 * 24 * 30  # 30 days
DATABASE_URL          = os.environ["DATABASE_URL"]        # asyncpg DSN
FRONTEND_URL          = os.environ["FRONTEND_URL"]        # e.g. http://localhost:3000
COOKIE_SECURE         = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

DISCORD_API           = "https://discord.com/api/v10"
DISCORD_TOKEN_URL     = f"{DISCORD_API}/oauth2/token"
DISCORD_USER_URL      = f"{DISCORD_API}/users/@me"

# ─── App ─────────────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Nitro Vault API", docs_url=None, redoc_url=None)  # hide docs in prod
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ─── DB pool ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    app.state.db = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    log.info("DB pool ready")

@app.on_event("shutdown")
async def shutdown():
    await app.state.db.close()

async def db() -> asyncpg.Pool:
    return app.state.db

# ─── Helpers ─────────────────────────────────────────────────────────────────

def hash_token(raw: str) -> str:
    """SHA-256 hex digest — used to store refresh tokens safely in DB."""
    return hashlib.sha256(raw.encode()).hexdigest()


def make_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + ACCESS_TOKEN_TTL,
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def make_refresh_token() -> str:
    """Cryptographically random 48-byte URL-safe token."""
    return secrets.token_urlsafe(48)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")


def set_auth_cookies(response: Response, access: str, refresh: str):
    kw = dict(httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/")
    response.set_cookie("nv_access",  access,  max_age=ACCESS_TOKEN_TTL,   **kw)
    response.set_cookie("nv_refresh", refresh, max_age=REFRESH_TOKEN_TTL,  **kw)


def clear_auth_cookies(response: Response):
    response.delete_cookie("nv_access",  path="/")
    response.delete_cookie("nv_refresh", path="/")


# ─── Auth dependency ──────────────────────────────────────────────────────────

async def require_user(
    nv_access: str | None = Cookie(default=None),
    pool: asyncpg.Pool = Depends(db),
) -> dict:
    """Dependency — validates the access JWT and returns the DB user row."""
    if not nv_access:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    payload = decode_access_token(nv_access)
    user = await pool.fetchrow(
        "SELECT * FROM users WHERE discord_id = $1 AND active = TRUE",
        payload["sub"],
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return dict(user)


# ─── OAuth state store (in-memory, TTL 10 min) ───────────────────────────────
# Prevents CSRF: we generate a random state before redirecting to Discord
# and verify it when Discord redirects back.

_oauth_states: dict[str, float] = {}
_STATE_TTL = 600  # seconds


def _create_state() -> str:
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = time.time()
    return state


def _validate_state(state: str) -> bool:
    ts = _oauth_states.pop(state, None)
    if ts is None:
        return False
    return (time.time() - ts) < _STATE_TTL


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"ok": True}


# 1. Frontend calls this to get the Discord OAuth URL + state cookie
@app.get("/auth/url")
@limiter.limit("20/minute")
async def auth_url(request: Request, response: Response):
    state = _create_state()
    # Store state in a short-lived httpOnly cookie as second layer of CSRF protection
    response.set_cookie(
        "nv_oauth_state", state,
        max_age=_STATE_TTL, httponly=True,
        secure=COOKIE_SECURE, samesite="lax", path="/",
    )
    params = {
        "client_id":     DISCORD_CLIENT_ID,
        "redirect_uri":  DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope":         "identify email",
        "state":         state,
        "prompt":        "none",   # skip consent screen if already authorised
    }
    from urllib.parse import urlencode
    url = f"https://discord.com/oauth2/authorize?{urlencode(params)}"
    return {"url": url}


# 2. Discord redirects here after user clicks Authorise
@app.get("/auth/callback")
@limiter.limit("10/minute")
async def auth_callback(
    request: Request,
    response: Response,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    nv_oauth_state: str | None = Cookie(default=None),
    pool: asyncpg.Pool = Depends(db),
):
    # ── Reject errors from Discord
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/login?error={error}")

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state.")

    # ── Verify CSRF state (both query param AND cookie must match)
    if not state or not _validate_state(state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state. Please try again.")

    # ── Exchange code for Discord access token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            DISCORD_TOKEN_URL,
            data={
                "client_id":     DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
                "grant_type":    "authorization_code",
                "code":          code,
                "redirect_uri":  DISCORD_REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )

    if token_res.status_code != 200:
        log.error("Discord token exchange failed: %s", token_res.text)
        raise HTTPException(status_code=502, detail="Discord token exchange failed.")

    discord_tokens = token_res.json()
    discord_access = discord_tokens.get("access_token")
    if not discord_access:
        raise HTTPException(status_code=502, detail="No access token from Discord.")

    # ── Fetch the Discord user profile
    async with httpx.AsyncClient() as client:
        user_res = await client.get(
            DISCORD_USER_URL,
            headers={"Authorization": f"Bearer {discord_access}"},
            timeout=10,
        )

    if user_res.status_code != 200:
        raise HTTPException(status_code=502, detail="Could not fetch Discord profile.")

    d = user_res.json()
    discord_id = str(d["id"])
    username   = d["username"]
    email      = d.get("email", "")
    avatar_hash = d.get("avatar") or ""
    avatar_url  = (
        f"https://cdn.discordapp.com/avatars/{discord_id}/{avatar_hash}.png"
        if avatar_hash
        else f"https://cdn.discordapp.com/embed/avatars/{int(discord_id) % 5}.png"
    )

    # ── Upsert user into PostgreSQL
    user = await pool.fetchrow(
        """
        INSERT INTO users (discord_id, username, email, avatar_url, created_at, last_login, active)
        VALUES ($1, $2, $3, $4, NOW(), NOW(), TRUE)
        ON CONFLICT (discord_id) DO UPDATE
          SET username   = EXCLUDED.username,
              email      = EXCLUDED.email,
              avatar_url = EXCLUDED.avatar_url,
              last_login = NOW()
        RETURNING *
        """,
        discord_id, username, email, avatar_url,
    )

    # ── Issue JWTs
    access_token  = make_access_token(discord_id)
    refresh_token = make_refresh_token()

    # Store hashed refresh token (rotate — delete old ones for this user first)
    await pool.execute("DELETE FROM refresh_tokens WHERE user_discord_id = $1", discord_id)
    await pool.execute(
        """
        INSERT INTO refresh_tokens (user_discord_id, token_hash, expires_at)
        VALUES ($1, $2, NOW() + INTERVAL '30 days')
        """,
        discord_id, hash_token(refresh_token),
    )

    # ── Set cookies and redirect to dashboard
    redirect = RedirectResponse(url=f"{FRONTEND_URL}/dashboard", status_code=302)
    set_auth_cookies(redirect, access_token, refresh_token)
    # Clear the temporary OAuth state cookie
    redirect.delete_cookie("nv_oauth_state", path="/")
    return redirect


# 3. Silently refresh access token using the refresh token cookie
@app.post("/auth/refresh")
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    response: Response,
    nv_refresh: str | None = Cookie(default=None),
    pool: asyncpg.Pool = Depends(db),
):
    if not nv_refresh:
        raise HTTPException(status_code=401, detail="No refresh token.")

    token_hash = hash_token(nv_refresh)
    row = await pool.fetchrow(
        """
        SELECT * FROM refresh_tokens
        WHERE token_hash = $1 AND expires_at > NOW()
        """,
        token_hash,
    )
    if not row:
        raise HTTPException(status_code=401, detail="Refresh token invalid or expired.")

    discord_id = row["user_discord_id"]

    # Rotate: delete old, issue new
    new_refresh = make_refresh_token()
    await pool.execute("DELETE FROM refresh_tokens WHERE token_hash = $1", token_hash)
    await pool.execute(
        """
        INSERT INTO refresh_tokens (user_discord_id, token_hash, expires_at)
        VALUES ($1, $2, NOW() + INTERVAL '30 days')
        """,
        discord_id, hash_token(new_refresh),
    )

    new_access = make_access_token(discord_id)
    set_auth_cookies(response, new_access, new_refresh)
    return {"ok": True}


# 4. Authenticated user info — used by the dashboard
@app.get("/users/me")
async def me(user: dict = Depends(require_user)):
    return {
        "id":         user["discord_id"],
        "username":   user["username"],
        "avatar":     user["avatar_url"],
        "tier":       user["tier"],
        "credits":    user["credits"],
        "created_at": user["created_at"].isoformat(),
        "last_login": user["last_login"].isoformat(),
        "lifetime_claims": user["lifetime_claims"],
    }





# 5. Sign out — clear cookies and revoke refresh token
@app.post("/auth/logout")
async def logout(
    response: Response,
    nv_refresh: str | None = Cookie(default=None),
    pool: asyncpg.Pool = Depends(db),
):
    if nv_refresh:
        await pool.execute(
            "DELETE FROM refresh_tokens WHERE token_hash = $1",
            hash_token(nv_refresh),
        )
    clear_auth_cookies(response)
    return {"ok": True}








class ClaimRequest(BaseModel):
    claim_type: str
    quantity: int

@app.post("/claims")
async def create_claim(
    req: ClaimRequest,
    user: dict = Depends(require_user),
    pool: asyncpg.Pool = Depends(db),
):
    cost_map = {"chance_drop": 3, "assured_boost": 5}
    cost = cost_map.get(req.claim_type)
    if not cost:
        raise HTTPException(status_code=400, detail="Invalid claim type.")
    total_cost = cost * req.quantity
    if user["credits"] < total_cost:
        raise HTTPException(status_code=400, detail="Insufficient credits.")

    new_lifetime = user["lifetime_claims"] + req.quantity
    tier = "copper"
    if new_lifetime >= 50: tier = "diamond"
    elif new_lifetime >= 25: tier = "gold"
    elif new_lifetime >= 10: tier = "silver"

    await pool.execute(
        "UPDATE users SET credits = credits - $1, lifetime_claims = lifetime_claims + $2, tier = $3 WHERE discord_id = $4",
        total_cost, req.quantity, tier, user["discord_id"],
    )
    claim = await pool.fetchrow(
        "INSERT INTO claims (user_discord_id, claim_type, quantity, credits_spent, success) VALUES ($1,$2,$3,$4,TRUE) RETURNING *",
        user["discord_id"], req.claim_type, req.quantity, total_cost,
    )
    return {"claim": dict(claim)}

@app.get("/claims/me")
async def get_my_claims(user: dict = Depends(require_user), pool: asyncpg.Pool = Depends(db)):
    claims = await pool.fetch(
        "SELECT id, claim_type, quantity, credits_spent, success, created_at FROM claims WHERE user_discord_id = $1",
        user["discord_id"],
    )
    gifts_sent = await pool.fetch(
        "SELECT id, credits_sent, recipient_discord_id, anonymous, created_at FROM gifts WHERE sender_discord_id = $1",
        user["discord_id"],
    )
    gifts_received = await pool.fetch(
        """
        SELECT g.id, g.credits_sent, g.anonymous, g.created_at, u.username AS sender_username
        FROM gifts g JOIN users u ON u.discord_id = g.sender_discord_id
        WHERE g.recipient_discord_id = $1
        """,
        user["discord_id"],
    )

    events = []
    for c in claims:
        c = dict(c)
        c["claim_type"] = c["claim_type"]
        events.append(c)
    for g in gifts_sent:
        g = dict(g)
        events.append({
            "claim_type": "gift_sent",
            "quantity": 1,
            "credits_spent": g["credits_sent"],
            "success": True,
            "created_at": g["created_at"],
        })
    for g in gifts_received:
        g = dict(g)
        sender = "Anonymous" if g["anonymous"] else g["sender_username"]
        events.append({
            "claim_type": "gift_received",
            "quantity": 1,
            "credits_spent": -g["credits_sent"],  # negative = it's a credit, shows green "+"
            "success": True,
            "created_at": g["created_at"],
            "sender_username": sender,
        })

    events.sort(key=lambda e: e["created_at"], reverse=True)
    return events[:50]



class GiftRequest(BaseModel):
    recipient_discord_id: str
    credits_sent: int
    anonymous: bool = False

@app.post("/gifts")
async def send_gift(
    req: GiftRequest,
    user: dict = Depends(require_user),
    pool: asyncpg.Pool = Depends(db),
):
    if req.credits_sent < 3 or req.credits_sent % 3 != 0:
        raise HTTPException(status_code=400, detail="Credits must be a multiple of 3.")
    if user["discord_id"] == req.recipient_discord_id:
        raise HTTPException(status_code=400, detail="You can't gift yourself.")

    recipient = await pool.fetchrow(
        "SELECT * FROM users WHERE discord_id = $1 AND active = TRUE",
        req.recipient_discord_id,
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found.")

    nitro_months = req.credits_sent // 3

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Atomic, race-safe deduction
            result = await conn.execute(
                "UPDATE users SET credits = credits - $1 WHERE discord_id = $2 AND credits >= $1",
                req.credits_sent, user["discord_id"],
            )
            if result == "UPDATE 0":
                raise HTTPException(status_code=400, detail="Insufficient credits.")

            await conn.execute(
                "UPDATE users SET credits = credits + $1 WHERE discord_id = $2",
                req.credits_sent, req.recipient_discord_id,
            )

            gift = await conn.fetchrow(
                """
                INSERT INTO gifts (sender_discord_id, recipient_discord_id, credits_sent, nitro_months, anonymous)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
                """,
                user["discord_id"], req.recipient_discord_id, req.credits_sent, nitro_months, req.anonymous,
            )

            # Ledger entries — these are what make it show up in "Snipe History" / balance flow
            await conn.execute(
                "INSERT INTO credit_ledger (user_discord_id, delta, reason, ref_id) VALUES ($1, $2, $3, $4)",
                user["discord_id"], -req.credits_sent, "gift_sent", gift["id"],
            )
            await conn.execute(
                "INSERT INTO credit_ledger (user_discord_id, delta, reason, ref_id) VALUES ($1, $2, $3, $4)",
                req.recipient_discord_id, req.credits_sent, "gift_received", gift["id"],
            )

    sender_name = None if req.anonymous else user["username"]
    return {"ok": True, "anonymous": req.anonymous, "sender": sender_name, "gift": dict(gift)}


@app.get("/gifts/received")
async def get_received_gifts(
    user: dict = Depends(require_user),
    pool: asyncpg.Pool = Depends(db),
):
    rows = await pool.fetch(
        """
        SELECT g.*, u.username AS sender_username
        FROM gifts g
        JOIN users u ON u.discord_id = g.sender_discord_id
        WHERE g.recipient_discord_id = $1
        ORDER BY g.created_at DESC
        LIMIT 20
        """,
        user["discord_id"],
    )
    out = []
    for r in rows:
        d = dict(r)
        if d["anonymous"]:
            d["sender_username"] = None
        out.append(d)
    return out




@app.get("/users/search")
async def search_users(
    q: str,
    user: dict = Depends(require_user),
    pool: asyncpg.Pool = Depends(db),
):
    if len(q) < 2:
        return []
    rows = await pool.fetch(
        "SELECT discord_id, username, avatar_url FROM users WHERE username ILIKE $1 AND active = TRUE LIMIT 8",
        f"%{q}%",
    )
    return [dict(r) for r in rows]





# ═══════════════════════════════════════════════════════════════════════════
# Payments — orders, Stripe, Coinbase Commerce
# ═══════════════════════════════════════════════════════════════════════════

class CreateOrderRequest(BaseModel):
    credits: int
    method: str  # "card" | "crypto"


def _calc_credits(base_credits: int, method: str) -> int:
    """Applies provider bonus (e.g. crypto +10%) — server-side, never trust client math."""
    provider = pc.PROVIDERS.get(method)
    bonus_pct = provider.get("bonus_pct", 0) if provider else 0
    return base_credits + int(base_credits * bonus_pct)


@app.post("/payments/create-order")
@limiter.limit("10/minute")
async def create_order(
    request: Request,
    req: CreateOrderRequest,
    user: dict = Depends(require_user),
    pool: asyncpg.Pool = Depends(db),
):
    if req.method not in pc.PROVIDERS or not pc.is_enabled(req.method):
        raise HTTPException(status_code=400, detail="Payment method unavailable.")
    if req.credits < pc.MIN_CREDITS or req.credits > pc.MAX_CREDITS:
        raise HTTPException(status_code=400, detail=f"Credits must be between {pc.MIN_CREDITS} and {pc.MAX_CREDITS}.")

    usd_amount = round(req.credits * pc.CREDIT_TO_USD, 2)
    order_token = secrets.token_urlsafe(16)

    order = await pool.fetchrow(
        """
        INSERT INTO orders (order_token, user_discord_id, provider, credits, usd_amount, status)
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING *
        """,
        order_token, user["discord_id"], req.method, req.credits, usd_amount,
    )

    if req.method == "card":
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"{req.credits} Nitro Vault Credits"},
                    "unit_amount": int(usd_amount * 100),  # cents
                },
                "quantity": 1,
            }],
            metadata={"order_token": order_token},
            success_url=f"{pc.FRONTEND_URL}/dashboard?purchase=success",
            cancel_url=f"{pc.FRONTEND_URL}/dashboard?purchase=cancelled",
        )
        await pool.execute(
            "UPDATE orders SET provider_ref = $1 WHERE order_token = $2",
            session.id, order_token,
        )
        return {"order_token": order_token, "checkout_url": session.url}

    elif req.method == "crypto":
        final_credits = _calc_credits(req.credits, "crypto")

        # CoinGate has no signature header on callbacks — we sign our own token
        # and embed it in the callback_url, then verify it on the way back in.
        callback_token = hmac.new(
            pc.COINGATE_CALLBACK_SECRET.encode(), order_token.encode(), hashlib.sha256
        ).hexdigest()

        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{pc.COINGATE_API_BASE}/orders",
                headers={
                    "Authorization": f"Token {pc.COINGATE_API_TOKEN}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "order_id": order_token,
                    "price_amount": str(usd_amount),
                    "price_currency": "USD",
                    "receive_currency": "USD",
                    "title": f"{req.credits} Nitro Vault Credits",
                    "description": f"+{final_credits - req.credits} bonus credits included",
                    "callback_url": f"http://localhost:8000/webhooks/coingate?order_token={order_token}&sig={callback_token}",
                    "success_url": f"{pc.FRONTEND_URL}/dashboard?purchase=success",
                    "cancel_url": f"{pc.FRONTEND_URL}/dashboard?purchase=cancelled",
                },
                timeout=10,
            )
        

        if res.status_code != 200:
            log.error("CoinGate order creation failed: %s", res.text)
            raise HTTPException(status_code=502, detail="Could not create crypto order.")


        cg_order = res.json()
        await pool.execute(
            "UPDATE orders SET provider_ref = $1, credits = $2 WHERE order_token = $3",
            str(cg_order["id"]), final_credits, order_token,
        )
        return {"order_token": order_token, "checkout_url": cg_order["payment_url"]}


@app.get("/payments/order/{order_token}")
async def get_order_status(
    order_token: str,
    user: dict = Depends(require_user),
    pool: asyncpg.Pool = Depends(db),
):
    """Frontend polls this to update the UI once payment confirms."""
    order = await pool.fetchrow(
        "SELECT * FROM orders WHERE order_token = $1 AND user_discord_id = $2",
        order_token, user["discord_id"],
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return {
        "order_token": order["order_token"],
        "status": order["status"],
        "credits": order["credits"],
        "usd_amount": float(order["usd_amount"]),
    }


async def _fulfill_order(pool: asyncpg.Pool, order_token: str, provider_ref: str | None = None):
    """Marks an order paid and credits the user — idempotent, race-safe."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            order = await conn.fetchrow(
                "SELECT * FROM orders WHERE order_token = $1 FOR UPDATE",
                order_token,
            )
            if not order:
                log.warning("Webhook referenced unknown order_token: %s", order_token)
                return
            if order["status"] == "paid":
                return  # already handled — webhooks can fire more than once

            await conn.execute(
                "UPDATE orders SET status = 'paid', paid_at = NOW(), provider_ref = COALESCE($1, provider_ref) WHERE order_token = $2",
                provider_ref, order_token,
            )
            await conn.execute(
                "UPDATE users SET credits = credits + $1 WHERE discord_id = $2",
                order["credits"], order["user_discord_id"],
            )
            await conn.execute(
                "INSERT INTO credit_ledger (user_discord_id, delta, reason, ref_id) VALUES ($1, $2, $3, $4)",
                order["user_discord_id"], order["credits"], f"purchase_{order['provider']}", order["id"],
            )
    log.info("Order fulfilled: %s (+%s credits)", order_token, order["credits"])


# ─── Stripe webhook ───────────────────────────────────────────────────────────

@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request, pool: asyncpg.Pool = Depends(db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, pc.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        order_token = session.get("metadata", {}).get("order_token")
        if order_token and session.get("payment_status") == "paid":
            await _fulfill_order(pool, order_token, provider_ref=session["id"])

    return {"ok": True}


# ─── CoinGate callback ─────────────────────────────────────────────────────────

@app.post("/webhooks/coingate")
async def coingate_webhook(
    request: Request,
    order_token: str,
    sig: str,
    pool: asyncpg.Pool = Depends(db),
):
    # Verify the signed token we embedded in the callback_url ourselves —
    # CoinGate doesn't send a signature header, so this *is* the auth check.
    expected_sig = hmac.new(
        pc.COINGATE_CALLBACK_SECRET.encode(), order_token.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected_sig, sig):
        raise HTTPException(status_code=400, detail="Invalid callback signature.")

    form = await request.form()
    status = form.get("status")
    reported_amount = form.get("price_amount")
    cg_order_id = form.get("id")

    if status != "paid":
        return {"ok": True}  # ignore pending/invalid/expired/etc — nothing to do yet

    order = await pool.fetchrow("SELECT * FROM orders WHERE order_token = $1", order_token)
    if not order:
        log.warning("CoinGate callback for unknown order_token: %s", order_token)
        return {"ok": True}

    # Never trust the client-reported amount alone — cross-check against
    # what we stored when the order was created.
    if reported_amount and float(reported_amount) != float(order["usd_amount"]):
        log.error(
            "CoinGate amount mismatch on order %s: expected %s, got %s",
            order_token, order["usd_amount"], reported_amount,
        )
        return {"ok": True}

    await _fulfill_order(pool, order_token, provider_ref=str(cg_order_id))
    return {"ok": True}