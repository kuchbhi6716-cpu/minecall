const express = require("express");
const http = require("http");
const path = require("path");
const { randomUUID } = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || true },
  maxHttpBufferSize: 5e6,
});

const PORT = process.env.PORT || 3000;
const distPath = path.join(__dirname, "dist");

app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));
app.use(express.static(distPath));

const TEST_MODE = process.env.TEST_MODE !== "false";

const CONNECTION_START_COINS = 10;
const COINS_PER_BILLING_TICK = 100;
const BILLING_INTERVAL_MS = 60_000;

const CREATOR_REVENUE_SHARE = Math.min(
  1,
  Math.max(0, Number(process.env.TEST_CREATOR_REVENUE_SHARE) || 0.7)
);

const CREATOR_SIGNUP_BONUS_INR = 1200;
const CREATOR_WITHDRAWAL_THRESHOLD_INR = 12000;

const COIN_PACKAGES = [
  { id: "coins_1000", coins: 1000, priceInr: 400, label: "1,000 Coins" },
  { id: "coins_2500", coins: 2500, priceInr: 900, label: "2,500 Coins" },
  { id: "coins_5000", coins: 5000, priceInr: 1700, label: "5,000 Coins" },
  { id: "coins_10000", coins: 10000, priceInr: 3200, label: "10,000 Coins" },
  { id: "coins_25000", coins: 25000, priceInr: 7500, label: "25,000 Coins" },
  { id: "coins_50000", coins: 50000, priceInr: 14000, label: "50,000 Coins" },
];

// DEMO ONLY: memory-based accounts and ledger.
// Not production authentication or real payment infrastructure.
const testAccounts = new Map();
const economyLedger = [];
const activeBillableCalls = new Map();

const liveCreators = new Map();
const subscriptionEarningsLedger = new Map();
const subscriptionTransactionIds = new Set();
// Demo-only exclusive reservations; reset on server restart.
const exclusiveAccessReservations = new Map();
// Demo-only shared subscription gallery; stored in memory and cleared when the server restarts.
const subscriptionMediaStore = new Map();
const waiting = [];
const partners = new Map();
const chatConversationBySocket = new Map();
const chatWritesByConversation = new Map();
const pendingCreatorCalls = new Map();
const liveRoomPrefix = "live:";
const commentRateLimits = new Map();

app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "OnlyStream", testMode: true });
});

// -------------------- Helpers --------------------

function getClientIp(req) {
  return (req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}

function redactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|auth|password|signature|psid/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }

    return url.origin + url.pathname + (url.search ? url.search : "");
  } catch {
    return "[invalid URL]";
  }
}

function parseProviderUrl(rawUrl, allowedHost) {
  const url = new URL(rawUrl);

  if (
    url.protocol !== "https:" ||
    url.hostname !== allowedHost ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid provider URL");
  }

  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "OnlyStream/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();

  console.log("[Provider] URL:", redactUrl(url));
  console.log("[Provider] HTTP:", response.status);
  console.log("[Provider] Content-Type:", contentType);

  if (!response.ok) {
    throw new Error(`Provider returned HTTP ${response.status}`);
  }

  if (!contentType.toLowerCase().includes("json")) {
    throw new Error("Provider returned non-JSON content");
  }

  let data;

  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("Provider returned invalid JSON");
  }

  if (data && typeof data === "object") {
    console.log("[Provider] Response fields:", Object.keys(data.data ?? data));
  }

  return data;
}

function safeUsername(value) {
  return typeof value === "string"
    ? value.trim().replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 30)
    : "";
}

function normalizeCreatorName(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 30)
    : "";
}

function normalizeRoomName(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 80)
    : "";
}


function supabaseServerConfig() {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const url = rawUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in Render.");
  return { url, key };
}

async function supabaseRest(table, query = "", options = {}) {
  const { url, key } = supabaseServerConfig();
  const response = await fetch(`${url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.error || `Supabase request failed (${response.status})`);
  return data;
}

async function supabaseRpc(name, args) {
  const { url, key } = supabaseServerConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.error || `Supabase RPC ${name} failed (${response.status})`);
  return data;
}

async function verifySupabaseAccount(accessToken, requestedUsername, requestedRole) {
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 5000) {
    return { ok: false, status: 401, error: "Your login session is missing or expired. Please log in again." };
  }
  try {
    const { url, key } = supabaseServerConfig();
    const authResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
    });
    if (!authResponse.ok) return { ok: false, status: 401, error: "Your login session could not be verified. Please log in again." };
    const authUser = await authResponse.json();
    if (!authUser?.id) return { ok: false, status: 401, error: "Your login session could not be verified. Please log in again." };
    const rows = await supabaseRest("profiles", `id=eq.${encodeURIComponent(authUser.id)}&select=id,username,role,gender,creator_plan,subscription_price,subscription_hours&limit=1`);
    const profile = Array.isArray(rows) ? rows[0] : null;
    const wanted = safeUsername(requestedUsername);
    if (!profile || profile.id !== authUser.id || safeUsername(profile.username) !== wanted || profile.role !== requestedRole) {
      return { ok: false, status: 403, error: "Your signed-in Supabase profile does not match this account and role." };
    }
    if (requestedRole === "creator" && String(profile.gender || "").toLowerCase() !== "female") {
      return { ok: false, status: 403, error: "This creator profile does not meet the current Creator requirements." };
    }
    return { ok: true, profile, user: authUser };
  } catch (error) {
    console.error("Supabase account verification failed:", error?.message || error);
    return { ok: false, status: 503, error: error?.message || "Could not verify your account with Supabase." };
  }
}

async function loadPersistentWallet(userId) {
  const rows = await supabaseRest("onlystream_wallets", `user_id=eq.${encodeURIComponent(userId)}&select=user_id,coins,creator_earnings_paise&limit=1`);
  if (Array.isArray(rows) && rows[0]) return rows[0];
  const created = await supabaseRest("onlystream_wallets", "", { method: "POST", body: { user_id: userId, coins: 0, creator_earnings_paise: 0 } });
  return Array.isArray(created) ? created[0] : created;
}

async function loadPersistentLedger(userId, limit = 30) {
  const rows = await supabaseRest("onlystream_wallet_transactions", `user_id=eq.${encodeURIComponent(userId)}&select=id,transaction_type,coins_delta,amount_paise_delta,related_user_id,reference_id,description,metadata,created_at&order=created_at.desc&limit=${limit}`);
  return (Array.isArray(rows) ? rows : []).map(row => ({
    id: row.id, at: row.created_at, type: row.transaction_type,
    coins: Number(row.coins_delta || 0),
    amountInr: Number(row.amount_paise_delta || 0) / 100,
    creatorShareInr: Number(row.amount_paise_delta || 0) / 100,
    relatedUserId: row.related_user_id || null,
    referenceId: row.reference_id || null,
    note: row.description || "",
    ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
  }));
}

// Create test accounts without silently changing an existing account's role.
// Creator accounts must have gender set to "female".
function getTestAccount(username, role = "user", gender = "") {
  const name = safeUsername(username);

  if (!name) return null;

  const requestedRole = role === "creator" ? "creator" : "user";
  const normalizedGender =
    typeof gender === "string" ? gender.trim().toLowerCase() : "";

  if (requestedRole === "creator" && normalizedGender !== "female") {
    return null;
  }

  if (!testAccounts.has(name)) {
    testAccounts.set(name, {
      username: name,
      role: requestedRole,
      gender: requestedRole === "creator" ? "female" : "",
      coins: 0,
      testRevenueInr: 0,
      testBonusInr: 0,
      bonusGranted: false,
      createdAt: new Date().toISOString(),
    });
  }

  const account = testAccounts.get(name);

  // Do not allow a user account to be upgraded to creator by this endpoint,
  // or a creator account to be changed into a user account.
  if (account.role !== requestedRole) {
    return null;
  }

  if (requestedRole === "creator" && account.gender !== "female") {
    return null;
  }

  return account;
}

async function verifySupabaseCreatorAccess(accessToken, requestedUsername) {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  const apiKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "";

  if (!supabaseUrl || !apiKey) {
    return { ok: false, status: 503, error: "Server authentication is not configured. Check SUPABASE_URL and the private Supabase server key in Render." };
  }
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 5000) {
    return { ok: false, status: 401, error: "Your login session is missing or expired. Please log in again." };
  }

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${accessToken}` },
    });
    if (!authResponse.ok) {
      return { ok: false, status: 401, error: "Your login session could not be verified. Please log in again." };
    }
    const authUser = await authResponse.json();
    if (!authUser?.id) {
      return { ok: false, status: 401, error: "Your login session could not be verified. Please log in again." };
    }

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,username,role,gender,creator_plan,subscription_price,subscription_hours&limit=1`,
      { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } }
    );
    if (!profileResponse.ok) {
      return { ok: false, status: 503, error: "Could not verify your creator profile in Supabase. Check the server key and profiles table access." };
    }
    const profiles = await profileResponse.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    const profileUsername = safeUsername(profile?.username);
    const requested = safeUsername(requestedUsername);

    if (!profile || !profile.id || profile.id !== authUser.id ||
        profile.role !== "creator" ||
        String(profile.gender || "").trim().toLowerCase() !== "female" ||
        !profileUsername || profileUsername !== requested) {
      return { ok: false, status: 403, error: "Your Supabase profile must have the matching username, Creator role, and Female gender to go live." };
    }

    return { ok: true, profile };
  } catch (error) {
    console.error("Supabase creator verification failed:", error?.message || error);
    return { ok: false, status: 503, error: "Could not reach Supabase to verify your creator account. Please retry." };
  }
}

function publicAccount(account) {
  if (!account) return null;

  return {
    username: account.username,
    role: account.role,
    gender: account.gender || "",
    coins: account.coins,
    testRevenueInr: account.testRevenueInr,
    testBonusInr: account.testBonusInr,
    withdrawalThresholdInr: CREATOR_WITHDRAWAL_THRESHOLD_INR,
    withdrawalEligible:
      account.role === "creator" &&
      account.testRevenueInr > CREATOR_WITHDRAWAL_THRESHOLD_INR,
    testMode: true,
  };
}

function ledgerEntry(entry) {
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    testMode: true,
    ...entry,
  };

  economyLedger.push(row);

  if (economyLedger.length > 10000) {
    economyLedger.shift();
  }

  return row;
}

function grantCreatorBonus(account) {
  if (!account || account.role !== "creator" || account.bonusGranted) {
    return;
  }

  account.bonusGranted = true;
  account.testBonusInr += CREATOR_SIGNUP_BONUS_INR;

  ledgerEntry({
    type: "creator-test-signup-bonus",
    username: account.username,
    amountInr: CREATOR_SIGNUP_BONUS_INR,
    note: "Test-only bonus. Not real money and not withdrawable.",
  });
}

// -------------------- Test Economy APIs --------------------

app.get("/api/test-mode", (req, res) => {
  res.set("Cache-Control", "no-store");

  res.json({
    testMode: true,
    realPaymentsEnabled: false,
    realWithdrawalsEnabled: false,
    connectionCoins: CONNECTION_START_COINS,
    callCoinsPerTick: COINS_PER_BILLING_TICK,
    billingIntervalMs: BILLING_INTERVAL_MS,
    creatorRevenueShare: CREATOR_REVENUE_SHARE,
    withdrawalThresholdInr: CREATOR_WITHDRAWAL_THRESHOLD_INR,
  });
});

app.get("/api/coin-packages", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ testMode: true, packages: COIN_PACKAGES });
});

// Demo bootstrap endpoint. This is not production authentication.
app.post("/api/test-account", async (req, res) => {
  if (!TEST_MODE) {
    return res.status(403).json({
      error: "Coin purchases are unavailable.",
    });
  }

  const username = safeUsername(req.body?.username);
  const role = req.body?.role === "creator" ? "creator" : "user";
  const gender =
    typeof req.body?.gender === "string"
      ? req.body.gender.trim().toLowerCase()
      : "";

  if (!username || !/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return res.status(400).json({
      error: "A valid username is required.",
    });
  }

  // Server-side Creator gender check.
  if (role === "creator" && gender !== "female") {
    return res.status(403).json({
      error: "Creator accounts are currently available only to users who select Female.",
    });
  }

  const verification = await verifySupabaseAccount(req.body?.accessToken, username, role);
  if (!verification.ok) return res.status(verification.status).json({ error: verification.error });

  // Prevent changing an existing account's role through this endpoint.
  const existingAccount = testAccounts.get(username);

  if (existingAccount && existingAccount.role !== role) {
    return res.status(409).json({
      error: `This username is already registered as ${existingAccount.role}.`,
    });
  }

  if (
    existingAccount &&
    existingAccount.role === "creator" &&
    existingAccount.gender !== "female"
  ) {
    return res.status(403).json({
      error: "This creator account does not meet the current Creator requirements.",
    });
  }

  const account = getTestAccount(username, role, gender);

  if (!account) {
    return res.status(403).json({
      error: "Could not initialize this account with the requested account type.",
    });
  }

  try {
    const wallet = await loadPersistentWallet(verification.profile.id);
    account.supabaseUserId = verification.profile.id;
    account.coins = Number(wallet?.coins || 0);
    account.testRevenueInr = Number(wallet?.creator_earnings_paise || 0) / 100;
    account.creatorPlan = verification.profile.creator_plan === "subscription" ? "subscription" : "calls";
    account.subscriptionPrice = Math.max(1, Number(verification.profile.subscription_price) || 499);
    account.subscriptionHours = [3, 5, 7, 24].includes(Number(verification.profile.subscription_hours)) ? Number(verification.profile.subscription_hours) : 24;
    if (role === "creator") {
      await supabaseRpc("creator_grant_signup_bonus", {
        p_creator_id: verification.profile.id,
        p_amount_paise: CREATOR_SIGNUP_BONUS_INR * 100,
        p_idempotency_key: `creator-bonus:${verification.profile.id}`,
      });
      const refreshedWallet = await loadPersistentWallet(verification.profile.id);
      account.testRevenueInr = Number(refreshedWallet?.creator_earnings_paise || 0) / 100;
      account.testBonusInr = CREATOR_SIGNUP_BONUS_INR;
      account.bonusGranted = true;
    }
  } catch (error) {
    console.error("Persistent wallet initialization failed:", error?.message || error);
    return res.status(503).json({ error: `Could not load your database wallet: ${error.message}` });
  }

  res.set("Cache-Control", "no-store");
  res.json({ account: publicAccount(account), testMode: true });
});

app.get("/api/economy/me", async (req, res) => {
  const username = safeUsername(req.query.username);
  const authorization = String(req.headers.authorization || "");
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const role = String(req.query.role || "user") === "creator" ? "creator" : "user";
  if (!username) return res.status(400).json({ error: "username query is required." });
  const verification = await verifySupabaseAccount(accessToken, username, role);
  if (!verification.ok) return res.status(verification.status).json({ error: verification.error });
  try {
    const wallet = await loadPersistentWallet(verification.profile.id);
    const rows = await loadPersistentLedger(verification.profile.id, 50);
    const account = {
      username, role, gender: verification.profile.gender || "",
      coins: Number(wallet?.coins || 0),
      testRevenueInr: Number(wallet?.creator_earnings_paise || 0) / 100,
      testBonusInr: role === "creator" ? CREATOR_SIGNUP_BONUS_INR : 0,
      withdrawalThresholdInr: CREATOR_WITHDRAWAL_THRESHOLD_INR,
      withdrawalEligible: role === "creator" && Number(wallet?.creator_earnings_paise || 0) / 100 >= CREATOR_WITHDRAWAL_THRESHOLD_INR,
      testMode: true,
    };
    res.set("Cache-Control", "no-store");
    return res.json({ account, recentLedger: rows, testMode: true });
  } catch (error) {
    console.error("Wallet read failed:", error?.message || error);
    return res.status(503).json({ error: `Could not read your database wallet: ${error.message}` });
  }
});

// Simulates a purchase. No payment is collected.
app.post("/api/coins/buy-test", async (req, res) => {
  if (!TEST_MODE) return res.status(403).json({ error: "Test coin credits are disabled." });
  const username = safeUsername(req.body?.username);
  const packageId = String(req.body?.packageId || "");
  const pack = COIN_PACKAGES.find(item => item.id === packageId);
  const authorization = String(req.headers.authorization || "");
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : String(req.body?.accessToken || "");
  if (!username || !pack) return res.status(400).json({ error: "A valid username and coin package are required." });
  const verification = await verifySupabaseAccount(accessToken, username, "user");
  if (!verification.ok) return res.status(verification.status).json({ error: verification.error });
  try {
    await supabaseRpc("wallet_credit_coins", {
      p_user_id: verification.profile.id, p_coins: pack.coins,
      p_type: "coin_credit", p_description: "TEST MODE: simulated coin credit; no payment collected",
      p_reference_id: `test-${packageId}-${Date.now()}`,
      p_idempotency_key: `test-coin-credit:${verification.profile.id}:${randomUUID()}`,
      p_metadata: { packageId, testPriceInr: pack.priceInr, testMode: true },
    });
    const wallet = await loadPersistentWallet(verification.profile.id);
    const account = getTestAccount(username, "user", "");
    if (account) { account.supabaseUserId = verification.profile.id; account.coins = Number(wallet?.coins || 0); }
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, account: account ? publicAccount(account) : { username, role: "user", coins: Number(wallet?.coins || 0) }, message: `Added ${pack.coins} test coins to your database wallet. No real payment was taken.`, testMode: true });
  } catch (error) {
    console.error("Test coin credit failed:", error?.message || error);
    return res.status(503).json({ error: `Could not credit database wallet: ${error.message}` });
  }
});

app.get("/api/creator-revenue-test", (req, res) => {
  const username = safeUsername(req.query.username);
  const account = testAccounts.get(username);

  if (!account || account.role !== "creator") {
    return res.status(404).json({
      error: "Test creator account not found.",
    });
  }

  res.set("Cache-Control", "no-store");

  res.json({
    account: publicAccount(account),
    realPayoutEnabled: false,
    message: "Revenue summary.",
  });
});

// -------------------- Existing A.W. Empire APIs --------------------

async function getVideoList(req) {
  const configuredUrl = process.env.AW_VIDEO_LIST_URL;

  if (!configuredUrl) {
    const error = new Error("Recorded video API is not configured");
    error.status = 503;
    throw error;
  }

  const clientIp = getClientIp(req);

  const replacedUrl = configuredUrl.replace(
    /CLIENT_IP/g,
    encodeURIComponent(clientIp)
  );

  const url = new URL(replacedUrl);

  if (
    url.protocol !== "https:" ||
    url.hostname !== "atwmcd.com" ||
    url.username ||
    url.password
  ) {
    const error = new Error("Invalid A.W. Empire video API URL");
    error.status = 400;
    throw error;
  }

  if (url.searchParams.has("clientIp")) {
    url.searchParams.set("clientIp", clientIp);
  }

  return fetchJson(url);
}

function findVideoById(value, wantedId) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoById(item, wantedId);
      if (found) return found;
    }

    return null;
  }

  if (!value || typeof value !== "object") return null;

  const id = String(value.id ?? value.videoId ?? value.video_id ?? "");

  if (id === wantedId && typeof value.detailsUrl === "string") {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findVideoById(child, wantedId);
    if (found) return found;
  }

  return null;
}

app.get("/api/aw-models", async (req, res) => {
  const feedUrl = process.env.AW_MODEL_FEED_URL;

  if (!feedUrl) {
    return res.status(503).json({
      error: "A.W. Empire Model Feed is not configured",
      message: "Set AW_MODEL_FEED_URL in Render Environment settings.",
    });
  }

  try {
    const url = new URL(feedUrl);

    if (url.protocol !== "https:" || url.username || url.password) {
      return res.status(400).json({
        error: "The Model Feed URL must use HTTPS",
      });
    }

    const data = await fetchJson(url);

    res.set("Cache-Control", "public, max-age=30");
    return res.json(data);
  } catch (error) {
    console.error("A.W. Empire models error:", error.message);

    return res.status(error.status || 502).json({
      error: "Could not load A.W. Empire models",
      details: error.message,
    });
  }
});

app.get("/api/aw-videos", async (req, res) => {
  try {
    const data = await getVideoList(req);

    res.set("Cache-Control", "private, no-store");
    return res.json(data);
  } catch (error) {
    console.error("A.W. Empire videos error:", error.message);

    return res.status(error.status || 502).json({
      error:
        error.message === "Recorded video API is not configured"
          ? error.message
          : "Could not load recorded videos",
      details: error.message,
    });
  }
});

app.get("/api/aw-video-details", async (req, res) => {
  const videoId = String(req.query.video || "").trim();

  if (!videoId || videoId.length > 200) {
    return res.status(400).json({
      error: "A valid video ID is required",
    });
  }

  try {
    const videoList = await getVideoList(req);
    const video = findVideoById(videoList, videoId);

    if (!video) {
      return res.status(404).json({
        error: "Video not found in the current video list",
      });
    }

    const detailsUrl = parseProviderUrl(video.detailsUrl, "atwmcd.com");
    const details = await fetchJson(detailsUrl);
    const videoDetails = details?.data ?? details;

    if (
      !videoDetails ||
      typeof videoDetails !== "object" ||
      Array.isArray(videoDetails)
    ) {
      return res.status(502).json({
        error: "Invalid provider details response",
      });
    }

    const detailFields = Object.keys(videoDetails);

    const embedFields = detailFields.filter((key) =>
      /embed|player|script|video.?url|stream/i.test(key)
    );

    console.log("[AW Video Details] Available fields:", detailFields);
    console.log("[AW Video Details] Embed-related fields:", embedFields);

    res.set("Cache-Control", "private, no-store");

    return res.json({
      ...videoDetails,
      _diagnostics: {
        availableFields: detailFields,
        embedRelatedFields: embedFields,
        playerEmbedUrlPresent:
          typeof videoDetails.playerEmbedUrl === "string",
      },
    });
  } catch (error) {
    console.error("A.W. Empire video details error:", error.message);

    return res.status(error.status || 502).json({
      error: "Could not load video details",
      details: error.message,
    });
  }
});

// -------------------- Creator Live Registry --------------------

function getPublicLiveCreators() {
  return Array.from(liveCreators.values()).map((creator) => ({
    username: creator.username,
    startedAt: creator.startedAt,
    creatorPlan: creator.creatorPlan || "calls",
    creator_plan: creator.creatorPlan || "calls",
    subscriptionPrice: Number(creator.subscriptionPrice) || 499,
    subscription_price: Number(creator.subscriptionPrice) || 499,
    subscriptionHours: Number(creator.subscriptionHours) || 24,
    subscription_hours: Number(creator.subscriptionHours) || 24,
    isLive: true,
    is_live: true,
    liveThumbnail: creator.liveThumbnail || null,
    live_thumbnail: creator.liveThumbnail || null,
  }));
}

function broadcastLiveCreators() {
  io.emit("live-creators-updated", getPublicLiveCreators());
}

function removeFromQueue(id) {
  let index;

  while ((index = waiting.indexOf(id)) !== -1) {
    waiting.splice(index, 1);
  }
}

function isSocketBusy(id) {
  if (partners.has(id)) return true;

  for (const request of pendingCreatorCalls.values()) {
    if (request.callerId === id || request.creatorId === id) {
      return true;
    }
  }

  return false;
}

function disconnectPartner(id) {
  const partnerId = partners.get(id);
  const conversationId = chatConversationBySocket.get(id) || (partnerId ? chatConversationBySocket.get(partnerId) : "");

  if (partnerId) {
    partners.delete(id);
    partners.delete(partnerId);
    io.to(partnerId).emit("partner-left");
  }

  // A call's chat is temporary: remove it from Supabase when either participant ends,
  // disconnects, or loses access. Also clear both socket mappings to prevent stale reuse.
  if (conversationId) {
    chatConversationBySocket.delete(id);
    if (partnerId) chatConversationBySocket.delete(partnerId);
    void deleteChatConversation(conversationId);
  }
}

function cancelPendingRequest(requestId, reason, notifyCaller = true) {
  const request = pendingCreatorCalls.get(requestId);
  if (!request) return;

  pendingCreatorCalls.delete(requestId);

  if (notifyCaller) {
    io.to(request.callerId).emit("creator-call-rejected", {
      creatorUsername: request.creatorUsername,
      reason,
    });
  }

  io.to(request.creatorId).emit("creator-call-request-cancelled", {
    requestId,
    reason,
  });
}

function cancelPendingCallsForSocket(socketId, reason) {
  for (const [requestId, request] of pendingCreatorCalls.entries()) {
    if (request.callerId === socketId || request.creatorId === socketId) {
      cancelPendingRequest(requestId, reason);
    }
  }
}

function removeCreatorLive(socket) {
  const username = socket.data.creatorLiveUsername;
  if (!username) return;

  cancelPendingCallsForSocket(
    socket.id,
    "The creator is no longer available."
  );

  stopBillingForSocket(socket.id, "ended");
  disconnectPartner(socket.id);

  const current = liveCreators.get(username);

  if (current?.socketId === socket.id) {
    liveCreators.delete(username);
    broadcastLiveCreators();
    console.log("Creator ended live:", username);
  }

  socket.data.creatorLiveUsername = null;
}

function getActiveExclusiveReservation(creatorUsername) {
  const key = safeUsername(creatorUsername);
  const reservation = exclusiveAccessReservations.get(key);
  if (!reservation) return null;
  if (Number(reservation.expiresAt) <= Date.now()) {
    const creatorSocketId = liveCreators.get(reservation.creatorUsername)?.socketId;
    for (const [socketId, connectedSocket] of io.sockets.sockets.entries()) {
      if (connectedSocket.data?.authUsername === reservation.buyerUsername &&
          partners.get(socketId) === creatorSocketId) {
        disconnectPartner(socketId);
        io.to(socketId).emit("partner-left");
        if (creatorSocketId) io.to(creatorSocketId).emit("partner-left");
      }
    }
    if (reservation.timer) clearTimeout(reservation.timer);
    exclusiveAccessReservations.delete(key);
    return null;
  }
  return reservation;
}

app.get("/api/exclusive-access/status", (req, res) => {
  res.set("Cache-Control", "no-store");
  const creatorUsername = normalizeCreatorName(req.query.creator || "");
  const buyerUsername = safeUsername(req.query.buyer || "");
  if (!creatorUsername) return res.status(400).json({ error: "Creator username is required." });
  const reservation = getActiveExclusiveReservation(creatorUsername);
  const creator = liveCreators.get(creatorUsername);
  res.json({
    ok: true,
    creatorAvailable: Boolean(creator && creator.creatorPlan === "subscription"),
    price: Number(creator?.subscriptionPrice || testAccounts.get(safeUsername(creatorUsername))?.subscriptionPrice || 499),
    occupied: Boolean(reservation && reservation.buyerUsername !== buyerUsername),
    owned: Boolean(reservation && reservation.buyerUsername === buyerUsername),
    expiresAt: reservation?.expiresAt || null,
    remainingMs: reservation ? Math.max(0, reservation.expiresAt - Date.now()) : 0,
    hours: Number(reservation?.accessHours || creator?.subscriptionHours || testAccounts.get(safeUsername(creatorUsername))?.subscriptionHours || 24),
  });
});

async function persistExclusiveEarning({ creatorUsername, buyerUsername = "User", grossAmount, creatorAmount, transactionId }) {
  const creatorName = safeUsername(creatorUsername);
  const buyerName = safeUsername(buyerUsername);
  if (!creatorName || !transactionId) return;
  const creators = await supabaseRest("profiles", `username=eq.${encodeURIComponent(creatorName)}&select=id,username&limit=1`);
  const creator = Array.isArray(creators) ? creators[0] : null;
  if (!creator?.id) throw new Error(`Creator profile not found for ${creatorName}`);
  const buyers = buyerName ? await supabaseRest("profiles", `username=eq.${encodeURIComponent(buyerName)}&select=id,username&limit=1`) : [];
  const buyer = Array.isArray(buyers) ? buyers[0] : null;
  await supabaseRest("onlystream_exclusive_earnings", "", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", body: {
    creator_id: creator.id,
    buyer_id: buyer?.id || null,
    transaction_id: transactionId,
    gross_amount_inr: Number(grossAmount || creatorAmount || 0),
    creator_amount_inr: Number(creatorAmount || 0),
    created_at: new Date().toISOString(),
    buyer_username: buyerName || "User"
  }});
}

app.get("/api/exclusive-earnings", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const username = normalizeCreatorName(req.query.username || "");
  if (!username) return res.status(400).json({ error: "Creator username is required." });
  try {
    const profiles = await supabaseRest("profiles", `username=eq.${encodeURIComponent(username)}&select=id&limit=1`);
    const creator = Array.isArray(profiles) ? profiles[0] : null;
    if (!creator?.id) return res.status(404).json({ error: "Creator profile not found." });
    const rows = await supabaseRest("onlystream_exclusive_earnings", `creator_id=eq.${encodeURIComponent(creator.id)}&select=id,transaction_id,gross_amount_inr,creator_amount_inr,created_at,buyer_username&order=created_at.desc&limit=1000`);
    const safeRows = Array.isArray(rows) ? rows : [];
    const now = Date.now();
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const sumSince = (since) => safeRows.filter(row => new Date(row.created_at).getTime() >= since).reduce((sum, row) => sum + Number(row.creator_amount_inr || 0), 0);
    return res.json({ ok: true, earnings: {
      today: Math.round(sumSince(startToday.getTime()) * 100) / 100,
      week: Math.round(sumSince(now - 7 * 24 * 60 * 60 * 1000) * 100) / 100,
      month: Math.round(sumSince(now - 30 * 24 * 60 * 60 * 1000) * 100) / 100,
      total: Math.round(safeRows.reduce((sum, row) => sum + Number(row.creator_amount_inr || 0), 0) * 100) / 100,
      transactions: safeRows.length,
    }, rows: safeRows.map(row => ({ id: row.transaction_id || row.id, amount: Number(row.creator_amount_inr || 0), grossAmount: Number(row.gross_amount_inr || row.creator_amount_inr || 0), createdAt: row.created_at, buyerUsername: row.buyer_username || "User" })) });
  } catch (error) {
    console.error("Persistent exclusive earnings read failed:", error?.message || error);
    return res.status(503).json({ error: "Could not load exclusive earnings from Supabase. Run the exclusive earnings SQL migration." });
  }
});

app.get("/api/live-creators", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ creators: getPublicLiveCreators() });
});

// -------------------- Test Call Billing --------------------

function finishBillableCall(callId) {
  const call = activeBillableCalls.get(callId);
  if (!call) return null;

  if (call.timer) {
    clearInterval(call.timer);
    call.timer = null;
  }

  activeBillableCalls.delete(callId);
  return call;
}

function getBillableCallId(socketA, socketB) {
  return [socketA, socketB].sort().join(":");
}

function findCallForSocket(socketId) {
  for (const call of activeBillableCalls.values()) {
    if (
      call.userSocketId === socketId ||
      call.otherSocketId === socketId
    ) {
      return call;
    }
  }

  return null;
}

function notifyBillingStopped(call, reason, balance) {
  io.to(call.userSocketId).emit("call-billing-stopped", {
    reason,
    balance: balance ?? testAccounts.get(call.username)?.coins ?? 0,
    testMode: true,
  });

  io.to(call.otherSocketId).emit("call-billing-stopped", {
    reason:
      reason === "insufficient-coins"
        ? "user-insufficient-coins"
        : reason,
    testMode: true,
  });
}

function stopBillingAndDisconnect(callId, reason) {
  const call = finishBillableCall(callId);
  if (!call) return;

  const user = testAccounts.get(call.username);

  notifyBillingStopped(call, reason, user?.coins ?? 0);

  // Disconnect both participants from the call pairing.
  disconnectPartner(call.userSocketId);
}

async function billCallTick(callId, coinsToCharge = COINS_PER_BILLING_TICK) {
  const call = activeBillableCalls.get(callId);
  if (!call) return false;

  const user = testAccounts.get(call.username);

  if (!user || user.role !== "user") {
    stopBillingAndDisconnect(callId, "account-unavailable");
    return false;
  }

  // Stop if either participant has left the call.
  if (
    partners.get(call.userSocketId) !== call.otherSocketId ||
    partners.get(call.otherSocketId) !== call.userSocketId
  ) {
    const finishedCall = finishBillableCall(callId);

    if (finishedCall) {
      notifyBillingStopped(finishedCall, "ended", user.coins);
    }

    return false;
  }

  // Do not allow a negative balance.
  if (user.coins < coinsToCharge) {
    stopBillingAndDisconnect(callId, "insufficient-coins");
    return false;
  }

  let creatorShareInr = 0;
  let estimatedValueInr = coinsToCharge * 0.4;
  let creator = null;

  // Only creator calls generate creator earnings. Random calls only debit the user wallet.
  if (call.callType === "creator" && call.creatorUsername) {
    creator = testAccounts.get(call.creatorUsername);
    if (!creator || creator.role !== "creator" || !creator.supabaseUserId) {
      stopBillingAndDisconnect(callId, "account-unavailable");
      return false;
    }
    creatorShareInr = Math.round(
      estimatedValueInr * CREATOR_REVENUE_SHARE * 100
    ) / 100;
  } else {
    estimatedValueInr = 0;
  }

  try {
    if (!user.supabaseUserId) throw new Error("User database identity is missing. Please reconnect.");

    const billingSequence = (call.billingSequence || 0) + 1;
    const creatorAmountPaise = Math.round(creatorShareInr * 100);

    // One database transaction debits the user and credits the creator together.
    // This prevents a successful user charge without a matching creator earning.
    await supabaseRpc("wallet_bill_creator_call", {
      p_user_id: user.supabaseUserId,
      p_coins: coinsToCharge,
      p_creator_id: creator?.supabaseUserId || null,
      p_creator_amount_paise: creator ? creatorAmountPaise : 0,
      p_related_user_id: user.supabaseUserId,
      p_reference_id: callId,
      p_debit_idempotency_key: `call-debit:${callId}:${billingSequence}`,
      p_earning_idempotency_key: creator ? `call-earning:${callId}:${billingSequence}` : null,
      p_metadata: { callType: call.callType, creatorUsername: call.creatorUsername || null, coinsCharged: coinsToCharge },
    });
    call.billingSequence = billingSequence;

    const walletAfterDebit = await loadPersistentWallet(user.supabaseUserId);
    user.coins = Number(walletAfterDebit?.coins || 0);

    if (creator) {
      const creatorWallet = await loadPersistentWallet(creator.supabaseUserId);
      creator.testRevenueInr = Number(creatorWallet?.creator_earnings_paise || 0) / 100;
    }
  } catch (error) {
    console.error("Atomic database call billing failed:", error?.message || error);
    stopBillingAndDisconnect(callId, error.message === "INSUFFICIENT_COINS" ? "insufficient-coins" : "billing-error");
    return false;
  }

  ledgerEntry({
    type: "test-call-billing",
    username: user.username,
    creatorUsername: call.creatorUsername || null,
    callType: call.callType,
    coins: coinsToCharge,
    estimatedValueInr,
    creatorShareInr,
    callId,
    note: "Call billing record.",
  });

  io.to(call.userSocketId).emit("call-billing-update", {
    coinsDeducted: coinsToCharge,
    balance: user.coins,
    callType: call.callType,
    testMode: true,
  });

  io.to(call.otherSocketId).emit("call-billing-update", {
    coinsCollected: coinsToCharge,
    testRevenueAddedInr: creatorShareInr,
    creatorUsername: call.creatorUsername || null,
    callType: call.callType,
    testMode: true,
  });

  console.log(
    `[Billing] ${user.username}: -${coinsToCharge} coins; balance=${user.coins}; type=${call.callType}`
  );

  return true;
}

async function startBillableCall({
  username,
  creatorUsername = "",
  userSocketId,
  otherSocketId,
}) {
  if (!TEST_MODE) {
    return { ok: false, error: "Test billing is disabled." };
  }

  const user = testAccounts.get(username);

  if (!user || user.role !== "user") {
    return {
      ok: false,
      error: "Create a test user account first.",
    };
  }

  if (
    !userSocketId ||
    !otherSocketId ||
    userSocketId === otherSocketId ||
    partners.get(userSocketId) !== otherSocketId ||
    partners.get(otherSocketId) !== userSocketId
  ) {
    return {
      ok: false,
      error: "A connected call is required.",
    };
  }

  const callId = getBillableCallId(userSocketId, otherSocketId);

  // Prevent duplicate billing timers for the same call.
  const existingCall = activeBillableCalls.get(callId);

  if (existingCall) {
    if (
      existingCall.userSocketId !== userSocketId ||
      existingCall.username !== username
    ) {
      return {
        ok: true,
        alreadyRunning: true,
        callId,
        balance: testAccounts.get(existingCall.username)?.coins ?? 0,
        testMode: true,
      };
    }

    return {
      ok: true,
      alreadyRunning: true,
      callId,
      balance: user.coins,
      testMode: true,
    };
  }

  // One socket cannot be charged for multiple simultaneous calls.
  if (findCallForSocket(userSocketId) || findCallForSocket(otherSocketId)) {
    return {
      ok: false,
      error: "Billing is already active for this call.",
    };
  }

  let resolvedCreatorUsername = "";
  let resolvedCallType = "random";

  if (creatorUsername) {
    const creatorName = normalizeCreatorName(creatorUsername);
    const creatorLive = liveCreators.get(creatorName);

    if (!creatorLive || creatorLive.socketId !== otherSocketId) {
      return {
        ok: false,
        error: "A connected creator call is required.",
      };
    }

    const creatorAccount = testAccounts.get(safeUsername(creatorName));

    if (
      !creatorAccount ||
      creatorAccount.role !== "creator" ||
      creatorAccount.gender !== "female"
    ) {
      return {
        ok: false,
        error: "Create a valid female creator test account first.",
      };
    }

    resolvedCreatorUsername = creatorAccount.username;
    resolvedCallType = "creator";
  }

  // The first charge is only 10 coins.
  if (user.coins < CONNECTION_START_COINS) {
    return {
      ok: false,
      error: "Not enough test coins to start the call.",
      balance: user.coins,
      requiredCoins: CONNECTION_START_COINS,
    };
  }

  const call = {
    callId,
    username,
    creatorUsername: resolvedCreatorUsername,
    callType: resolvedCallType,
    userSocketId,
    otherSocketId,
    timer: null,
    startedAt: Date.now(),
  };

  activeBillableCalls.set(callId, call);

  // Charge 10 coins immediately when billing starts.
  if (!(await billCallTick(callId, CONNECTION_START_COINS))) {
    return {
      ok: false,
      error: "Could not start billing.",
      balance: testAccounts.get(username)?.coins ?? 0,
    };
  }

  // Charge 100 coins every 60 seconds after the initial charge.
  call.timer = setInterval(() => {
    void billCallTick(callId, COINS_PER_BILLING_TICK);
  }, BILLING_INTERVAL_MS);

  return {
    ok: true,
    callId,
    callType: resolvedCallType,
    connectionCoins: CONNECTION_START_COINS,
    coinsPerTick: COINS_PER_BILLING_TICK,
    billingIntervalMs: BILLING_INTERVAL_MS,
    balance: testAccounts.get(username)?.coins ?? 0,
    testMode: true,
  };
}

function stopBillingForSocket(socketId, reason = "ended") {
  const calls = [...activeBillableCalls.entries()];
  let stopped = 0;

  for (const [callId, call] of calls) {
    if (
      call.userSocketId !== socketId &&
      call.otherSocketId !== socketId
    ) {
      continue;
    }

    const finishedCall = finishBillableCall(callId);
    if (!finishedCall) continue;

    notifyBillingStopped(
      finishedCall,
      reason,
      testAccounts.get(finishedCall.username)?.coins ?? 0
    );

    stopped++;
  }

  return stopped;
}

// -------------------- Live Comments --------------------

function getLiveRoom(model) {
  return liveRoomPrefix + model;
}

function canPostComment(socket) {
  const now = Date.now();
  const previous = commentRateLimits.get(socket.id) || [];
  const recent = previous.filter(
    (timestamp) => now - timestamp < 10000
  );

  if (recent.length >= 5) {
    commentRateLimits.set(socket.id, recent);
    return false;
  }

  recent.push(now);
  commentRateLimits.set(socket.id, recent);

  return true;
}

// Persistent chat helpers. Only authenticated Supabase users are saved.
function getSupabaseServerConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    .replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}

async function verifyChatSocket(accessToken) {
  const config = getSupabaseServerConfig();
  if (!config || typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 5000) return null;
  try {
    const authRes = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.key, Authorization: `Bearer ${accessToken}` },
    });
    if (!authRes.ok) return null;
    const user = await authRes.json();
    if (!user?.id) return null;
    const profileRes = await fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,username&limit=1`, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    });
    if (!profileRes.ok) return null;
    const rows = await profileRes.json();
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile?.id || profile.id !== user.id || !profile.username) return null;
    return { id: profile.id, username: safeUsername(profile.username) };
  } catch (error) {
    console.error("[Chat persistence] Session verification failed:", error.message);
    return null;
  }
}

async function persistChatMessage({ conversationId, sender, receiver, message }) {
  const config = getSupabaseServerConfig();
  if (!config || !conversationId || !sender?.id || !receiver?.id || !message) return;

  // Serialize writes per conversation so cleanup can wait for pending inserts.
  const previous = chatWritesByConversation.get(conversationId) || Promise.resolve();
  const write = previous.catch(() => {}).then(async () => {
    const currentConfig = getSupabaseServerConfig();
    if (!currentConfig) return;
    const response = await fetch(`${currentConfig.url}/rest/v1/chat_messages`, {
      method: "POST",
      headers: {
        apikey: currentConfig.key,
        Authorization: `Bearer ${currentConfig.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender_id: sender.id,
        receiver_id: receiver.id,
        sender_username: sender.username,
        receiver_username: receiver.username,
        message,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[Chat persistence] Save failed:", response.status, detail.slice(0, 300));
    }
  }).catch((error) => {
    console.error("[Chat persistence] Save failed:", error.message);
  });
  chatWritesByConversation.set(conversationId, write);
  await write;
}

async function deleteChatConversation(conversationId) {
  if (!conversationId) return;
  const pendingWrite = chatWritesByConversation.get(conversationId);
  if (pendingWrite) await pendingWrite.catch(() => {});

  const config = getSupabaseServerConfig();
  if (!config) {
    console.warn("[Chat cleanup] Supabase server key is not configured; database deletion was skipped.");
    return;
  }
  try {
    const response = await fetch(
      `${config.url}/rest/v1/chat_messages?conversation_id=eq.${encodeURIComponent(conversationId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          Prefer: "return=minimal",
        },
      }
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[Chat cleanup] Delete failed:", response.status, detail.slice(0, 300));
      return;
    }
    console.log("[Chat cleanup] Deleted temporary conversation:", conversationId);
  } catch (error) {
    console.error("[Chat cleanup] Delete failed:", error.message);
  } finally {
    chatWritesByConversation.delete(conversationId);
  }
}

// -------------------- Socket.IO --------------------

io.use(async (socket, next) => {
  // Authenticate before this socket can enter the stranger queue.
  const account = await verifyChatSocket(socket.handshake?.auth?.accessToken);
  if (account) {
    socket.data.chatUser = account;
    socket.data.authUsername = account.username;
  }
  next();
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("get-live-creators", () => {
    socket.emit("live-creators-updated", getPublicLiveCreators());
  });

  socket.on("creator-live-thumbnail", (payload) => {
    const username = socket.data.creatorLiveUsername;
    if (!username || !payload || typeof payload.thumbnail !== "string") return;

    const thumbnail = payload.thumbnail;
    // Accept only small JPEG data URLs generated by the creator's own live preview.
    if (!thumbnail.startsWith("data:image/jpeg;base64,") || thumbnail.length > 220000) return;

    const creator = liveCreators.get(username);
    if (!creator || creator.socketId !== socket.id) return;

    creator.liveThumbnail = thumbnail;
    broadcastLiveCreators();
  });

  socket.on("creator-go-live", async (payload, acknowledge) => {
    const reply = (result) => {
      if (typeof acknowledge === "function") acknowledge(result);
    };

    const username = normalizeCreatorName(payload?.username);

    if (!username) {
      return reply({
        ok: false,
        error: "A valid creator username is required.",
      });
    }

    // Verify the real Supabase session and profile before allowing a creator live session.
    const verification = await verifySupabaseCreatorAccess(payload?.accessToken, username);
    if (!verification.ok) {
      return reply({ ok: false, error: verification.error });
    }

    const profile = verification.profile;
    let creatorAccount = testAccounts.get(safeUsername(username));

    if (!creatorAccount) {
      creatorAccount = getTestAccount(username, "creator", "female");
    }
    if (!creatorAccount || creatorAccount.role !== "creator" || creatorAccount.gender !== "female") {
      return reply({
        ok: false,
        error: "This account conflicts with an existing session. Please log out and log in again.",
      });
    }

    // Keep the existing call/wallet flow compatible while using Supabase as the authority for identity.
    creatorAccount.creatorPlan = profile.creator_plan === "subscription" ? "subscription" : "calls";
    creatorAccount.subscriptionPrice = Math.max(1, Number(profile.subscription_price) || 499);
    creatorAccount.subscriptionHours = [3, 5, 7, 24].includes(Number(profile.subscription_hours))
      ? Number(profile.subscription_hours)
      : 24;
    creatorAccount.supabaseUserId = profile.id;
    try {
      const persistentWallet = await loadPersistentWallet(profile.id);
      creatorAccount.coins = Number(persistentWallet?.coins || 0);
      creatorAccount.testRevenueInr = Number(persistentWallet?.creator_earnings_paise || 0) / 100;
    } catch (error) {
      console.error("Creator wallet load failed:", error?.message || error);
      return reply({ ok: false, error: "Could not load creator wallet from database." });
    }

    removeCreatorLive(socket);

    const previous = liveCreators.get(username);

    if (previous && previous.socketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(previous.socketId);

      if (oldSocket) {
        cancelPendingCallsForSocket(
          oldSocket.id,
          "The creator's live session was replaced."
        );

        stopBillingForSocket(oldSocket.id, "ended");
        disconnectPartner(oldSocket.id);

        oldSocket.data.creatorLiveUsername = null;
        oldSocket.emit("creator-live-replaced");
      }
    }

    const requestedPlan = String(payload?.creatorPlan || payload?.creator_plan || payload?.plan || "calls").toLowerCase();
    const creatorPlan = requestedPlan === "subscription" ? "subscription" : "calls";
    const parsedPrice = Number(payload?.subscriptionPrice ?? payload?.subscription_price);
    const subscriptionPrice = Number.isFinite(parsedPrice) && parsedPrice >= 1
      ? Math.min(Math.round(parsedPrice), 100000)
      : 499;
    const parsedHours = Number(payload?.subscriptionHours ?? payload?.subscription_hours);
    const subscriptionHours = [3, 5, 7, 24].includes(parsedHours) ? parsedHours : 24;

    creatorAccount.creatorPlan = creatorPlan;
    creatorAccount.subscriptionPrice = creatorPlan === "subscription" ? subscriptionPrice : 0;
    creatorAccount.subscriptionHours = creatorPlan === "subscription" ? subscriptionHours : 0;

    const creator = {
      username,
      socketId: socket.id,
      creatorPlan,
      subscriptionPrice,
      subscriptionHours: creatorPlan === "subscription" ? subscriptionHours : 0,
      startedAt: new Date().toISOString(),
    };

    liveCreators.set(username, creator);
    socket.data.creatorLiveUsername = username;
    if (creatorPlan === "subscription") socket.join(`subscription-viewers:${username.toLowerCase()}`);

    broadcastLiveCreators();

    console.log("Creator went live:", username);

    reply({
      ok: true,
      creator: {
        username,
        creatorPlan: creator.creatorPlan,
        creator_plan: creator.creatorPlan,
        subscriptionPrice: creator.subscriptionPrice,
        subscription_price: creator.subscriptionPrice,
        subscriptionHours: creator.subscriptionHours || 24,
        subscription_hours: creator.subscriptionHours || 24,
        startedAt: creator.startedAt,
      },
    });
  });

  socket.on("creator-end-live", (acknowledge) => {
    removeCreatorLive(socket);

    if (typeof acknowledge === "function") {
      acknowledge({ ok: true });
    }
  });

  // User requests a call with a live creator.
  socket.on("creator-call-request", (payload, acknowledge) => {
    const reply = (result) => {
      if (typeof acknowledge === "function") acknowledge(result);
    };

    const username = normalizeCreatorName(payload?.username);

    const callerName =
      typeof payload?.callerName === "string"
        ? payload.callerName.trim().replace(/\s+/g, " ").slice(0, 30)
        : "Viewer";
    const callerUsername = safeUsername(payload?.callerUsername || "");

    if (!username) {
      return reply({
        ok: false,
        error: "Invalid creator username.",
      });
    }

    if (socket.data.creatorLiveUsername) {
      return reply({
        ok: false,
        error: "Creators cannot call themselves as viewers.",
      });
    }

    if (isSocketBusy(socket.id)) {
      return reply({
        ok: false,
        error: "You already have an active call or request.",
      });
    }

    const creator = liveCreators.get(username);

    if (!creator || !io.sockets.sockets.has(creator.socketId)) {
      return reply({
        ok: false,
        error: "This creator is no longer live.",
      });
    }

    const creatorAccount = testAccounts.get(safeUsername(username));

    if (
      !creatorAccount ||
      creatorAccount.role !== "creator" ||
      creatorAccount.gender !== "female"
    ) {
      return reply({
        ok: false,
        error: "This creator account is not eligible for calls.",
      });
    }

    const creatorIsExclusive = (creatorAccount.creatorPlan || "calls") === "subscription";
    if (payload?.exclusive === true && !creatorIsExclusive) {
      return reply({ ok: false, error: "Exclusive no-coin access is only available for exclusive creators." });
    }

    if (creatorIsExclusive) {
      const reservation = getActiveExclusiveReservation(username);
      if (!callerUsername || !reservation || reservation.buyerUsername !== callerUsername) {
        return reply({ ok: false, error: "Purchase this creator's 24-hour exclusive access before calling." });
      }
      const callerAccount = testAccounts.get(callerUsername);
      if (!callerAccount || callerAccount.role !== "user") {
        return reply({ ok: false, error: "Please sign in with the buyer account that owns this access." });
      }
      socket.data.authUsername = callerUsername;
    } else if (callerUsername) {
      socket.data.authUsername = callerUsername;
    }

    if (isSocketBusy(creator.socketId)) {
      return reply({
        ok: false,
        error: "This creator is busy right now.",
      });
    }

    // Auto-connect directly: no incoming request or manual Accept click.
    // Recheck both sockets immediately before pairing to avoid stale live status.
    const callerSocket = io.sockets.sockets.get(socket.id);
    const creatorSocket = io.sockets.sockets.get(creator.socketId);

    if (!callerSocket || !creatorSocket) {
      return reply({
        ok: false,
        error: "The viewer or creator disconnected. Please try again.",
      });
    }

    if (isSocketBusy(socket.id) || isSocketBusy(creator.socketId)) {
      return reply({
        ok: false,
        error: "The creator or viewer is busy right now.",
      });
    }

    const request = {
      callerId: socket.id,
      creatorId: creator.socketId,
      creatorUsername: creator.username,
      callerName: callerName || "Viewer",
    };

    partners.set(request.callerId, request.creatorId);
    partners.set(request.creatorId, request.callerId);

    // Emit accepted BEFORE matched. CreatorDashboard sets its call-ready flag
    // on creator-call-accepted and then handles matched to create the WebRTC peer.
    io.to(request.callerId).emit("creator-call-accepted", {
      creatorUsername: request.creatorUsername,
    });
    io.to(request.creatorId).emit("creator-call-accepted", {
      callerName: request.callerName,
      creatorUsername: request.creatorUsername,
    });

    const pairCallerSocket = io.sockets.sockets.get(request.callerId);
    const pairCreatorSocket = io.sockets.sockets.get(request.creatorId);
    const conversationId = pairCallerSocket?.data?.chatUser && pairCreatorSocket?.data?.chatUser
      ? randomUUID()
      : "";
    if (conversationId) {
      chatConversationBySocket.set(request.callerId, conversationId);
      chatConversationBySocket.set(request.creatorId, conversationId);
    }
    io.to(request.callerId).emit("matched", {
      initiator: request.callerId < request.creatorId,
      callType: "creator",
      creatorUsername: request.creatorUsername,
      conversationId,
      partnerUserId: pairCreatorSocket?.data?.chatUser?.id || "",
    });
    io.to(request.creatorId).emit("matched", {
      initiator: request.creatorId < request.callerId,
      callType: "creator",
      callerName: request.callerName,
      conversationId,
      partnerUserId: pairCallerSocket?.data?.chatUser?.id || "",
    });

    reply({
      ok: true,
      creatorUsername: creator.username,
      message: `Connecting to ${creator.username} automatically...`,
    });

    console.log(
      "Creator call auto-connected:",
      request.callerName,
      "<->",
      username
    );
  });

  socket.on("creator-call-accept", (payload, acknowledge) => {
    const reply = (result) => {
      if (typeof acknowledge === "function") acknowledge(result);
    };

    const requestId =
      typeof payload?.requestId === "string" ? payload.requestId : "";

    const request = pendingCreatorCalls.get(requestId);

    if (!request || request.creatorId !== socket.id) {
      return reply({
        ok: false,
        error: "This call request is no longer available.",
      });
    }

    if (
      !io.sockets.sockets.has(request.callerId) ||
      !io.sockets.sockets.has(request.creatorId)
    ) {
      cancelPendingRequest(requestId, "The viewer or creator disconnected.");

      return reply({
        ok: false,
        error: "One participant has disconnected.",
      });
    }

    if (partners.has(request.callerId) || partners.has(request.creatorId)) {
      cancelPendingRequest(requestId, "One participant is already in a call.");

      return reply({
        ok: false,
        error: "One participant is already in a call.",
      });
    }

    pendingCreatorCalls.delete(requestId);

    partners.set(request.callerId, request.creatorId);
    partners.set(request.creatorId, request.callerId);

    io.to(request.callerId).emit("creator-call-accepted", {
      creatorUsername: request.creatorUsername,
    });

    io.to(request.creatorId).emit("creator-call-accepted", {
      callerName: request.callerName,
      creatorUsername: request.creatorUsername,
    });

    const pairCallerSocket = io.sockets.sockets.get(request.callerId);
    const pairCreatorSocket = io.sockets.sockets.get(request.creatorId);
    const conversationId = pairCallerSocket?.data?.chatUser && pairCreatorSocket?.data?.chatUser
      ? randomUUID()
      : "";
    if (conversationId) {
      chatConversationBySocket.set(request.callerId, conversationId);
      chatConversationBySocket.set(request.creatorId, conversationId);
    }
    io.to(request.callerId).emit("matched", {
      initiator: request.callerId < request.creatorId,
      callType: "creator",
      creatorUsername: request.creatorUsername,
      conversationId,
      partnerUserId: pairCreatorSocket?.data?.chatUser?.id || "",
    });

    io.to(request.creatorId).emit("matched", {
      initiator: request.creatorId < request.callerId,
      callType: "creator",
      callerName: request.callerName,
      conversationId,
      partnerUserId: pairCallerSocket?.data?.chatUser?.id || "",
    });

    reply({ ok: true, message: "Call accepted." });

    console.log(
      "Creator call accepted:",
      request.callerName,
      "<->",
      request.creatorUsername
    );
  });

  socket.on("creator-call-reject", (payload, acknowledge) => {
    const requestId =
      typeof payload?.requestId === "string" ? payload.requestId : "";

    const request = pendingCreatorCalls.get(requestId);

    if (!request || request.creatorId !== socket.id) {
      if (typeof acknowledge === "function") {
        acknowledge({
          ok: false,
          error: "This call request is no longer available.",
        });
      }

      return;
    }

    cancelPendingRequest(
      requestId,
      "The creator declined your call request."
    );

    if (typeof acknowledge === "function") {
      acknowledge({ ok: true });
    }

    console.log("Creator rejected call:", request.creatorUsername);
  });

  socket.on("creator-call-cancel", (payload, acknowledge) => {
    const requestId =
      typeof payload?.requestId === "string" ? payload.requestId : "";

    const request = pendingCreatorCalls.get(requestId);

    if (!request || request.callerId !== socket.id) {
      if (typeof acknowledge === "function") {
        acknowledge({ ok: false });
      }

      return;
    }

    cancelPendingRequest(
      requestId,
      "The viewer cancelled the call request.",
      false
    );

    if (typeof acknowledge === "function") {
      acknowledge({ ok: true });
    }
  });

  // Start billing for a connected random or creator call.
  socket.on("call-billing-start", async (payload, acknowledge) => {
    const reply = (result) => {
      if (typeof acknowledge === "function") acknowledge(result);
    };

    const username = safeUsername(payload?.username);
    const creatorUsername = normalizeCreatorName(
      payload?.creatorUsername || ""
    );

    const otherSocketId = partners.get(socket.id);

    if (!otherSocketId) {
      return reply({
        ok: false,
        error: "A connected call is required.",
      });
    }

    if (creatorUsername) {
      const reservation = getActiveExclusiveReservation(creatorUsername);
      if (reservation && reservation.buyerUsername === username) {
        return reply({ ok: true, exclusive: true, callId: "", balance: testAccounts.get(username)?.coins ?? 0 });
      }
    }

    const result = await startBillableCall({
      username,
      creatorUsername,
      userSocketId: socket.id,
      otherSocketId,
    });

    reply(result);
  });

  socket.on("call-billing-stop", (payload, acknowledge) => {
    const requestedId =
      typeof payload?.callId === "string" ? payload.callId : "";

    let stopped = 0;

    if (requestedId) {
      const call = activeBillableCalls.get(requestedId);

      if (
        call &&
        (call.userSocketId === socket.id ||
          call.otherSocketId === socket.id)
      ) {
        const finishedCall = finishBillableCall(requestedId);

        if (finishedCall) {
          notifyBillingStopped(
            finishedCall,
            "ended",
            testAccounts.get(finishedCall.username)?.coins ?? 0
          );

          stopped++;
        }
      }
    } else {
      stopped = stopBillingForSocket(socket.id, "ended");
    }

    if (typeof acknowledge === "function") {
      acknowledge({ ok: true, stopped });
    }
  });

  // Live comments.
  socket.on("live-join", (rawModel) => {
    const model = normalizeRoomName(rawModel);

    if (!model) {
      return socket.emit("live-error", "Invalid stream name.");
    }

    for (const room of socket.rooms) {
      if (room.startsWith(liveRoomPrefix)) {
        socket.leave(room);
      }
    }

    socket.data.liveModel = model;
    socket.join(getLiveRoom(model));
    socket.emit("live-joined", { model });

    console.log("Live comment room joined:", socket.id, model);
  });

  socket.on("live-comment", (payload) => {
    const model = socket.data.liveModel;

    if (!model || !payload || typeof payload !== "object") {
      return;
    }

    if (!canPostComment(socket)) {
      socket.emit(
        "live-error",
        "Slow down a little before posting another comment."
      );
      return;
    }

    const name =
      typeof payload.name === "string"
        ? payload.name.trim().replace(/\s+/g, " ").slice(0, 24)
        : "";

    const message =
      typeof payload.message === "string"
        ? payload.message.trim().replace(/\s+/g, " ").slice(0, 180)
        : "";

    if (!name || !message) return;

    io.to(getLiveRoom(model)).emit("live-comment", {
      id: `${socket.id}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name,
      message,
      createdAt: Date.now(),
    });
  });

  // Random video chat.
  socket.on("find-stranger", () => {
    stopSearching(socket);

    if (isSocketBusy(socket.id)) {
      socket.emit("waiting");
      return;
    }

    while (waiting.length) {
      const partnerId = waiting.shift();

      if (
        partnerId === socket.id ||
        !io.sockets.sockets.has(partnerId) ||
        isSocketBusy(partnerId)
      ) {
        continue;
      }

      partners.set(socket.id, partnerId);
      partners.set(partnerId, socket.id);

      const partnerSocket = io.sockets.sockets.get(partnerId);
      const conversationId = socket.data.chatUser && partnerSocket?.data?.chatUser
        ? randomUUID()
        : "";
      if (conversationId) {
        chatConversationBySocket.set(socket.id, conversationId);
        chatConversationBySocket.set(partnerId, conversationId);
      }

      socket.emit("matched", {
        initiator: socket.id < partnerId,
        callType: "random",
        conversationId,
        partnerUserId: partnerSocket?.data?.chatUser?.id || "",
      });

      io.to(partnerId).emit("matched", {
        initiator: partnerId < socket.id,
        callType: "random",
        conversationId,
        partnerUserId: socket.data.chatUser?.id || "",
      });

      console.log("Matched:", socket.id, partnerId);
      return;
    }

    waiting.push(socket.id);
    socket.emit("waiting");

    console.log("Waiting in queue:", socket.id);
  });

  socket.on("stop-chat", () => {
    stopSearching(socket);
    cancelPendingCallsForSocket(
      socket.id,
      "The participant ended the call request."
    );

    stopBillingForSocket(socket.id, "ended");

    console.log("Chat stopped:", socket.id);
  });

  socket.on("typing", (isTyping) => {
    const partnerId = partners.get(socket.id);
    if (!partnerId || typeof isTyping !== "boolean") return;

    const sender = io.sockets.sockets.get(socket.id);
    const receiver = io.sockets.sockets.get(partnerId);
    const creatorSocket = sender?.data?.creatorLiveUsername
      ? sender
      : receiver?.data?.creatorLiveUsername
        ? receiver
        : null;

    if (creatorSocket) {
      const creator = liveCreators.get(creatorSocket.data.creatorLiveUsername);
      if (creator?.creatorPlan === "subscription") {
        const buyerSocket = creatorSocket.id === socket.id ? receiver : sender;
        const reservation = getActiveExclusiveReservation(creator.username);
        if (!reservation || reservation.buyerUsername !== buyerSocket?.data?.authUsername) {
          disconnectPartner(socket.id);
          io.to(socket.id).emit("partner-left");
          if (partnerId) io.to(partnerId).emit("partner-left");
          return;
        }
      }
    }

    io.to(partnerId).emit("typing", isTyping);
  });

  socket.on("chat-message", (message) => {
    const partnerId = partners.get(socket.id);
    if (!partnerId || typeof message !== "string" || !message.trim()) return;
    const sender = io.sockets.sockets.get(socket.id);
    const receiver = io.sockets.sockets.get(partnerId);
    const creatorSocket = sender?.data?.creatorLiveUsername ? sender : receiver?.data?.creatorLiveUsername ? receiver : null;
    if (creatorSocket) {
      const creator = liveCreators.get(creatorSocket.data.creatorLiveUsername);
      if (creator?.creatorPlan === "subscription") {
        const buyerSocket = creatorSocket.id === socket.id ? receiver : sender;
        const reservation = getActiveExclusiveReservation(creator.username);
        if (!reservation || reservation.buyerUsername !== buyerSocket?.data?.authUsername) {
          disconnectPartner(socket.id);
          io.to(socket.id).emit("partner-left");
          return;
        }
      }
    }
    const cleanMessage = message.trim().slice(0, 1000);
    const senderAccount = sender?.data?.chatUser;
    const receiverAccount = receiver?.data?.chatUser;
    const conversationId = chatConversationBySocket.get(socket.id);
    if (conversationId && senderAccount && receiverAccount) {
      void persistChatMessage({
        conversationId,
        sender: senderAccount,
        receiver: receiverAccount,
        message: cleanMessage,
      });
    }
    io.to(partnerId).emit("chat-message", {
      text: cleanMessage,
      conversationId: conversationId || "",
      senderUsername: senderAccount?.username || "",
    });
  });

  // Demo subscription ledger: kept on the server so creator dashboard refresh works across browsers while this process is running.
  // One-time exclusive access purchase. This is a demo payment flow, not a real charge.
  socket.on("exclusive-access-purchase", (payload, acknowledge) => {
    const reply = (result) => { if (typeof acknowledge === "function") acknowledge(result); };
    const creatorUsername = normalizeCreatorName(payload?.creatorUsername || "");
    const buyerUsername = safeUsername(payload?.buyerUsername || "");
    const transactionId = String(payload?.transactionId || "").slice(0, 120);
    if (!creatorUsername || !buyerUsername || !transactionId) {
      return reply({ ok: false, error: "Missing creator, buyer, or transaction reference." });
    }
    const buyer = testAccounts.get(buyerUsername);
    if (!buyer || buyer.role !== "user") {
      return reply({ ok: false, error: "Please sign in with a user account before purchasing access." });
    }
    const creatorAccount = testAccounts.get(safeUsername(creatorUsername));
    const creator = liveCreators.get(creatorUsername);
    if (!creatorAccount || creatorAccount.role !== "creator" ||
        (creatorAccount.creatorPlan || "calls") !== "subscription" ||
        !creator || creator.creatorPlan !== "subscription" ||
        !io.sockets.sockets.has(creator.socketId)) {
      return reply({ ok: false, error: "This exclusive creator is currently unavailable. Try again later." });
    }
    const price = Math.max(1, Number(creator.subscriptionPrice || creatorAccount.subscriptionPrice || 499));
    const suppliedAmount = Number(payload?.amount);
    if (!Number.isFinite(suppliedAmount) || Math.round(suppliedAmount * 100) !== Math.round(price * 100)) {
      return reply({ ok: false, error: "The access fee changed. Refresh the page and try again." });
    }
    const current = getActiveExclusiveReservation(creatorUsername);
    if (current) {
      if (current.buyerUsername === buyerUsername) {
        return reply({ ok: true, alreadyOwned: true, expiresAt: current.expiresAt, remainingMs: Math.max(0, current.expiresAt - Date.now()) });
      }
      return reply({ ok: false, error: "This creator is already reserved by another user.", expiresAt: current.expiresAt, remainingMs: Math.max(0, current.expiresAt - Date.now()) });
    }
    const accessHours = [3, 5, 7, 24].includes(Number(creator.subscriptionHours))
      ? Number(creator.subscriptionHours)
      : 24;
    const accessDurationMs = accessHours * 60 * 60 * 1000;
    const expiresAt = Date.now() + accessDurationMs;
    const reservation = {
      creatorUsername, buyerUsername, amount: price, transactionId,
      purchasedAt: Date.now(), expiresAt, accessHours, timer: null,
    };
    reservation.timer = setTimeout(() => {
      const currentReservation = exclusiveAccessReservations.get(safeUsername(creatorUsername));
      if (currentReservation?.transactionId !== transactionId) return;
      exclusiveAccessReservations.delete(safeUsername(creatorUsername));
      const creatorSocketId = liveCreators.get(creatorUsername)?.socketId;
      for (const [socketId, connectedSocket] of io.sockets.sockets.entries()) {
        if (connectedSocket.data?.authUsername === buyerUsername && partners.get(socketId) === creatorSocketId) {
          disconnectPartner(socketId);
          io.to(socketId).emit("partner-left");
          if (creatorSocketId) io.to(creatorSocketId).emit("partner-left");
        }
      }
    }, accessDurationMs);
    exclusiveAccessReservations.set(safeUsername(creatorUsername), reservation);
    if (!subscriptionTransactionIds.has(transactionId)) {
      subscriptionTransactionIds.add(transactionId);
      const key = creatorUsername.toLowerCase();
      const rows = subscriptionEarningsLedger.get(key) || [];
      rows.push({
        amount: Math.round(price * CREATOR_REVENUE_SHARE * 100) / 100,
        grossAmount: price,
        createdAt: new Date().toISOString(),
        transactionId,
        buyerUsername,
      });
      subscriptionEarningsLedger.set(key, rows);
      void persistExclusiveEarning({ creatorUsername, buyerUsername, grossAmount: price, creatorAmount: Math.round(price * CREATOR_REVENUE_SHARE * 100) / 100, transactionId })
        .catch(error => console.error("Exclusive earning persistence failed:", error?.message || error));
      const liveCreator = liveCreators.get(creatorUsername);
      if (liveCreator?.socketId) io.to(liveCreator.socketId).emit("subscription-earnings-updated", { username: creatorUsername });
    }
    console.log(`[Exclusive access] ${buyerUsername} reserved ${creatorUsername} for ${accessHours} hours.`);
    return reply({ ok: true, expiresAt, remainingMs: accessDurationMs, price, hours: accessHours, demoPayment: true });
  });

  socket.on("subscription-purchase", (payload, acknowledge) => {
    const username = normalizeCreatorName(payload?.username);
    const amount = Number(payload?.amount);
    const transactionId = String(payload?.transactionId || "").slice(0, 120);
    if (!username || !Number.isFinite(amount) || amount < 1 || amount > 100000 || !transactionId) {
      if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Invalid demo subscription record." });
      return;
    }
    if (!subscriptionTransactionIds.has(transactionId)) {
      subscriptionTransactionIds.add(transactionId);
      const key = username.toLowerCase();
      const rows = subscriptionEarningsLedger.get(key) || [];
      rows.push({ amount: Math.round(amount * 100) / 100, createdAt: new Date().toISOString(), transactionId });
      subscriptionEarningsLedger.set(key, rows);
      void persistExclusiveEarning({ creatorUsername: username, buyerUsername: "User", grossAmount: amount, creatorAmount: amount, transactionId })
        .catch(error => console.error("Subscription earning persistence failed:", error?.message || error));
      const creator = liveCreators.get(username);
      if (creator?.socketId) io.to(creator.socketId).emit("subscription-earnings-updated", { username });
    }
    if (typeof acknowledge === "function") acknowledge({ ok: true });
  });

  socket.on("subscription-earnings-get", (payload, acknowledge) => {
    const username = normalizeCreatorName(payload?.username);
    if (!username) {
      if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Creator username is required." });
      return;
    }
    const rows = subscriptionEarningsLedger.get(username.toLowerCase()) || [];
    const now = Date.now();
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const sumSince = (since) => rows.filter(row => new Date(row.createdAt).getTime() >= since).reduce((sum, row) => sum + row.amount, 0);
    if (typeof acknowledge === "function") acknowledge({ ok: true, earnings: {
      today: Math.round(sumSince(startToday.getTime()) * 100) / 100,
      week: Math.round(sumSince(now - 7 * 24 * 60 * 60 * 1000) * 100) / 100,
      month: Math.round(sumSince(now - 30 * 24 * 60 * 60 * 1000) * 100) / 100,
      total: Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
      transactions: rows.length,
    } });
  });

  // Shared subscription gallery for creators and subscribers on different devices.
  // Demo-only: stored in server memory, so uploads reset when the server restarts.
  socket.on("subscription-media-get", (payload, acknowledge) => {
    const username = normalizeCreatorName(payload?.username);
    if (!username) { if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Creator username is required." }); return; }
    const items = subscriptionMediaStore.get(username.toLowerCase()) || [];
    if (typeof acknowledge === "function") acknowledge({ ok: true, items });
  });

  socket.on("subscription-media-upload", (payload, acknowledge) => {
    const username = normalizeCreatorName(payload?.username);
    const item = payload?.item;
    if (!username || !item || typeof item.data !== "string" || item.data.length > 3_000_000 || !/^data:(image\/|video\/)/i.test(item.data) || !["photo", "video"].includes(item.type)) {
      if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Invalid upload. Use an image or video under 2 MB." }); return;
    }
    const key = username.toLowerCase();
    const items = subscriptionMediaStore.get(key) || [];
    if (items.length >= 100) { if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Gallery limit reached. Delete an old item first." }); return; }
    const safeItem = { id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 120), name: String(item.name || "Creator upload").slice(0, 180), type: item.type, data: item.data, createdAt: new Date().toISOString() };
    items.push(safeItem);
    subscriptionMediaStore.set(key, items);
    io.to(`subscription-viewers:${key}`).emit("subscription-media-updated", { username, items });
    if (typeof acknowledge === "function") acknowledge({ ok: true, items });
  });

  socket.on("subscription-media-delete", (payload, acknowledge) => {
    const username = normalizeCreatorName(payload?.username);
    const id = String(payload?.id || "").slice(0, 120);
    if (!username || !id) { if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Creator and media ID are required." }); return; }
    const key = username.toLowerCase();
    const items = (subscriptionMediaStore.get(key) || []).filter((item) => item.id !== id);
    subscriptionMediaStore.set(key, items);
    io.to(`subscription-viewers:${key}`).emit("subscription-media-updated", { username, items });
    if (typeof acknowledge === "function") acknowledge({ ok: true, items });
  });

  // Subscription broadcasts use a separate signaling path from paid calls.
  // Viewers join by creator username; the creator relays WebRTC offers/answers/candidates.
  socket.on("subscription-live-join", (payload, acknowledge) => {
    const username = normalizeCreatorName(payload?.username);
    const creator = username ? liveCreators.get(username) : null;
    if (!creator || !io.sockets.sockets.get(creator.socketId)) {
      if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Creator is not live right now." });
      return;
    }
    socket.join(`subscription-viewers:${username.toLowerCase()}`);
    socket.data.subscriptionCreatorUsername = username;
    socket.emit("subscription-live-ready", { username, creatorSocketId: creator.socketId });
    io.to(creator.socketId).emit("subscription-viewer-joined", { viewerSocketId: socket.id, username });
    if (typeof acknowledge === "function") acknowledge({ ok: true, username, creatorSocketId: creator.socketId });
  });

  socket.on("subscription-chat-message", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const username = normalizeCreatorName(payload.username);
    const text = typeof payload.text === "string" ? payload.text.trim().slice(0, 500) : "";
    if (!username || !text) return;
    const room = `subscription-viewers:${username.toLowerCase()}`;
    if (!socket.rooms.has(room)) return;
    io.to(room).emit("subscription-chat-message", {
      id: `${Date.now()}-${socket.id}`,
      username,
      name: String(payload.name || "Subscriber").slice(0, 40),
      text,
      sentAt: new Date().toISOString(),
    });
  });

  socket.on("subscription-live-signal", (payload) => {
    if (!payload || typeof payload !== "object" || !["offer", "answer", "candidate"].includes(payload.type)) return;
    const targetId = typeof payload.targetSocketId === "string" ? payload.targetSocketId : "";
    const target = io.sockets.sockets.get(targetId);
    if (!target) return;
    const username = normalizeCreatorName(payload.username);
    const liveCreator = username ? liveCreators.get(username) : null;
    const senderIsCreator = liveCreator?.socketId === socket.id;
    const senderIsViewer = socket.data.subscriptionCreatorUsername?.toLowerCase() === username.toLowerCase();
    if (!senderIsCreator && !senderIsViewer) return;
    if (senderIsViewer && targetId !== liveCreator?.socketId) return;
    if (senderIsCreator && !target.rooms.has(`subscription-viewers:${username.toLowerCase()}`)) return;
    io.to(targetId).emit("subscription-live-signal", {
      username,
      type: payload.type,
      offer: payload.offer,
      answer: payload.answer,
      candidate: payload.candidate,
      fromSocketId: socket.id,
    });
  });

  socket.on("signal", (data) => {
    const partnerId = partners.get(socket.id);
    if (!partnerId || !data || !["offer", "answer", "candidate"].includes(data.type)) return;
    const sender = io.sockets.sockets.get(socket.id);
    const receiver = io.sockets.sockets.get(partnerId);
    const creatorSocket = sender?.data?.creatorLiveUsername ? sender : receiver?.data?.creatorLiveUsername ? receiver : null;
    if (creatorSocket) {
      const creator = liveCreators.get(creatorSocket.data.creatorLiveUsername);
      if (creator?.creatorPlan === "subscription") {
        const buyerSocket = creatorSocket.id === socket.id ? receiver : sender;
        const reservation = getActiveExclusiveReservation(creator.username);
        if (!reservation || reservation.buyerUsername !== buyerSocket?.data?.authUsername) {
          disconnectPartner(socket.id);
          io.to(socket.id).emit("partner-left");
          return;
        }
      }
    }
    io.to(partnerId).emit("signal", data);
  });

  socket.on("disconnect", () => {
    stopBillingForSocket(socket.id, "disconnected");

    removeFromQueue(socket.id);

    cancelPendingCallsForSocket(
      socket.id,
      "A participant disconnected."
    );

    disconnectPartner(socket.id);
    removeCreatorLive(socket);
    commentRateLimits.delete(socket.id);

    console.log("User disconnected:", socket.id);
  });
});

function stopSearching(socket) {
  removeFromQueue(socket.id);

  // Stop active billing before ending the pairing.
  stopBillingForSocket(socket.id, "ended");

  disconnectPartner(socket.id);
}

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("OnlyStream server running on port", PORT);
  console.log(
    "Testing economy:",
    TEST_MODE ? "enabled" : "disabled"
  );
  console.log(
    `Test billing: ${CONNECTION_START_COINS} coins on connection, then ${COINS_PER_BILLING_TICK} coins every ${BILLING_INTERVAL_MS / 1000} seconds`
  );
});
