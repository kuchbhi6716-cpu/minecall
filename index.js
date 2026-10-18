
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || true },
  maxHttpBufferSize: 1e6,
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
const waiting = [];
const partners = new Map();
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

function getTestAccount(username, role = "user") {
  const name = safeUsername(username);
  if (!name) return null;

  if (!testAccounts.has(name)) {
    testAccounts.set(name, {
      username: name,
      role: role === "creator" ? "creator" : "user",
      coins: 0,
      testRevenueInr: 0,
      testBonusInr: 0,
      bonusGranted: false,
      createdAt: new Date().toISOString(),
    });
  }

  const account = testAccounts.get(name);

  if (role === "creator") {
    account.role = "creator";
  }

  return account;
}

function publicAccount(account) {
  if (!account) return null;

  return {
    username: account.username,
    role: account.role,
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

// Demo bootstrap endpoint. Username is NOT authenticated; testing only.
app.post("/api/test-account", (req, res) => {
  if (!TEST_MODE) {
    return res.status(403).json({
      error: "Testing economy is disabled.",
    });
  }

  const username = safeUsername(req.body?.username);
  const role = req.body?.role === "creator" ? "creator" : "user";

  if (!username) {
    return res.status(400).json({
      error: "A valid username is required.",
    });
  }

  const account = getTestAccount(username, role);

  if (role === "creator") {
    grantCreatorBonus(account);
  }

  res.set("Cache-Control", "no-store");
  res.json({ account: publicAccount(account), testMode: true });
});

app.get("/api/economy/me", (req, res) => {
  const username = safeUsername(req.query.username);

  if (!username) {
    return res.status(400).json({
      error: "username query is required.",
    });
  }

  const account = testAccounts.get(username);

  if (!account) {
    return res.status(404).json({
      error: "Test account not found.",
    });
  }

  res.set("Cache-Control", "no-store");

  res.json({
    account: publicAccount(account),
    recentLedger: economyLedger
      .filter(
        (row) =>
          row.username === username || row.creatorUsername === username
      )
      .slice(-50)
      .reverse(),
    testMode: true,
  });
});

// Simulates a purchase. No payment is collected.
app.post("/api/coins/buy-test", (req, res) => {
  if (!TEST_MODE) {
    return res.status(403).json({
      error: "Testing economy is disabled.",
    });
  }

  const username = safeUsername(req.body?.username);
  const packageId = String(req.body?.packageId || "");

  const account = testAccounts.get(username);
  const pack = COIN_PACKAGES.find((item) => item.id === packageId);

  if (!account || account.role !== "user") {
    return res.status(404).json({
      error: "Test user account not found.",
    });
  }

  if (!pack) {
    return res.status(400).json({
      error: "Invalid coin package.",
    });
  }

  account.coins += pack.coins;

  ledgerEntry({
    type: "test-coin-credit",
    username,
    coins: pack.coins,
    testPriceInr: pack.priceInr,
    note: "Simulated purchase. No real payment was taken.",
  });

  res.set("Cache-Control", "no-store");

  res.json({
    ok: true,
    account: publicAccount(account),
    message: `Added ${pack.coins} test coins. No real payment was taken.`,
  });
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
    message: "Revenue is simulated test accounting only.",
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
  if (!partnerId) return;

  partners.delete(id);
  partners.delete(partnerId);

  io.to(partnerId).emit("partner-left");
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

function billCallTick(callId, coinsToCharge = COINS_PER_BILLING_TICK) {
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

  user.coins -= coinsToCharge;

  let creatorShareInr = 0;
  let estimatedValueInr = coinsToCharge * 0.4;

  // Only creator calls earn creator demo revenue.
  if (call.callType === "creator" && call.creatorUsername) {
    const creator = testAccounts.get(call.creatorUsername);

    if (creator?.role === "creator") {
      creatorShareInr =
        Math.round(
          estimatedValueInr * CREATOR_REVENUE_SHARE * 100
        ) / 100;

      creator.testRevenueInr =
        Math.round(
          (creator.testRevenueInr + creatorShareInr) * 100
        ) / 100;
    }
  } else {
    estimatedValueInr = 0;
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
    note: "Simulated call billing; not a real purchase or payout.",
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

function startBillableCall({
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

    if (!creatorAccount || creatorAccount.role !== "creator") {
      return {
        ok: false,
        error: "Create the creator's test account first.",
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
  if (!billCallTick(callId, CONNECTION_START_COINS)) {
    return {
      ok: false,
      error: "Could not start billing.",
      balance: testAccounts.get(username)?.coins ?? 0,
    };
  }

  // Charge 100 coins every 60 seconds after the initial charge.
  call.timer = setInterval(() => {
    billCallTick(callId, COINS_PER_BILLING_TICK);
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

// -------------------- Socket.IO --------------------

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("get-live-creators", () => {
    socket.emit("live-creators-updated", getPublicLiveCreators());
  });

  socket.on("creator-go-live", (payload, acknowledge) => {
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

    const creator = {
      username,
      socketId: socket.id,
      startedAt: new Date().toISOString(),
    };

    liveCreators.set(username, creator);
    socket.data.creatorLiveUsername = username;

    broadcastLiveCreators();

    console.log("Creator went live:", username);

    reply({
      ok: true,
      creator: {
        username,
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

    if (isSocketBusy(creator.socketId)) {
      return reply({
        ok: false,
        error: "This creator is busy right now.",
      });
    }

    const requestId = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    const request = {
      requestId,
      callerId: socket.id,
      creatorId: creator.socketId,
      creatorUsername: creator.username,
      callerName: callerName || "Viewer",
      createdAt: Date.now(),
    };

    pendingCreatorCalls.set(requestId, request);

    io.to(creator.socketId).emit("incoming-creator-call", {
      requestId,
      callerName: request.callerName,
      creatorUsername: creator.username,
    });

    reply({
      ok: true,
      requestId,
      creatorUsername: creator.username,
      message: "Call request sent. Waiting for the creator.",
    });

    console.log(
      "Creator call requested:",
      request.callerName,
      "->",
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

    io.to(request.callerId).emit("matched", {
      initiator: request.callerId < request.creatorId,
      callType: "creator",
      creatorUsername: request.creatorUsername,
    });

    io.to(request.creatorId).emit("matched", {
      initiator: request.creatorId < request.callerId,
      callType: "creator",
      callerName: request.callerName,
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
  socket.on("call-billing-start", (payload, acknowledge) => {
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

    const result = startBillableCall({
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

      socket.emit("matched", {
        initiator: socket.id < partnerId,
        callType: "random",
      });

      io.to(partnerId).emit("matched", {
        initiator: partnerId < socket.id,
        callType: "random",
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

    if (partnerId && typeof isTyping === "boolean") {
      io.to(partnerId).emit("typing", isTyping);
    }
  });

  socket.on("chat-message", (message) => {
    const partnerId = partners.get(socket.id);

    if (!partnerId || typeof message !== "string" || !message.trim()) {
      return;
    }

    io.to(partnerId).emit("chat-message", message.trim().slice(0, 1000));
  });

  socket.on("signal", (data) => {
    const partnerId = partners.get(socket.id);

    if (
      !partnerId ||
      !data ||
      typeof data !== "object" ||
      !["offer", "answer", "candidate"].includes(data.type)
    ) {
      return;
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
