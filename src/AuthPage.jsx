import React, { useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  UserRound,
  Video,
} from "lucide-react";

const ACCOUNTS_KEY = "onlystream-test-accounts-v1";
const SESSION_KEY = "onlystream-test-session-v1";
const API_BASE = "";

function readAccounts() {
  try {
    const saved = localStorage.getItem(ACCOUNTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getSafeNextPath(role) {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  const safeNext = Boolean(
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\") &&
    !/^\/(?:login|signup|creator)(?:[/?#]|$)/i.test(next)
  );

  if (role === "creator") {
    try {
      const session = JSON.parse(localStorage.getItem("onlystream-test-session-v1") || "null");
      if (session?.creatorPlan === "subscription") return "/subscription-creator";
    } catch {}
    return "/creator";
  }

  // Users normally land on Home, but subscription login links return them
  // to the exact creator page they tried to open before authentication.
  if (role === "user") return safeNext ? next : "/";
  return safeNext ? next : "/";
}

async function initializeTestAccount(username, role, gender = "") {
  const response = await fetch(`${API_BASE}/api/test-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, role, gender }),
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok || !data.account) {
    throw new Error(
      data.error || "Could not initialize the test account."
    );
  }

  return data.account;
}

export default function AuthPage({ initialMode = "login" }) {
  const [mode, setMode] = useState(
    initialMode === "signup" ? "signup" : "login"
  );

  const [role, setRole] = useState("user");
  const [gender, setGender] = useState("");
  const [creatorPlan, setCreatorPlan] = useState("calls");
  const [subscriptionPrice, setSubscriptionPrice] = useState("499");
  const [subscriptionHours, setSubscriptionHours] = useState("24");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    const cleanUsername = username.trim().toLowerCase();

    if (!/^[a-z0-9_.-]{3,30}$/.test(cleanUsername)) {
      setMessage(
        "Username must be 3–30 characters and use only letters, numbers, dots, underscores or hyphens."
      );
      return;
    }

    if (password.length < 6) {
      setMessage("Password must contain at least 6 characters.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    if (mode === "signup" && role === "creator" && gender !== "female") {
      setMessage(
        "Creator signup is currently available only to users who select Female."
      );
      return;
    }

    setBusy(true);

    try {
      const accounts = readAccounts();
      const passwordHash = await hashPassword(password);

      const existing = accounts.find(
        (account) => account.username === cleanUsername
      );

      let account;

      if (mode === "signup") {
        if (existing) {
          setMessage("That username already exists. Please log in.");
          return;
        }

        account = {
          username: cleanUsername,
          role,
          gender: role === "creator" ? gender : "",
          creatorPlan: role === "creator" ? creatorPlan : "",
          subscriptionPrice: role === "creator" && creatorPlan === "subscription" ? Math.max(1, Number(subscriptionPrice) || 1) : 0,
          subscriptionHours: role === "creator" && creatorPlan === "subscription" ? [3, 5, 7, 24].includes(Number(subscriptionHours)) ? Number(subscriptionHours) : 24 : 0,
          passwordHash,
          createdAt: new Date().toISOString(),
        };

        localStorage.setItem(
          ACCOUNTS_KEY,
          JSON.stringify([...accounts, account])
        );
      } else {
        if (!existing || existing.passwordHash !== passwordHash) {
          setMessage("Incorrect username or password.");
          return;
        }

        if (existing.role !== role) {
          setMessage(
            `This account is registered as ${existing.role}. Choose the correct account type.`
          );
          return;
        }

        if (existing.role === "creator" && existing.gender !== "female") {
          setMessage(
            "This creator account does not have the required gender information. Please contact support or create a new account with a different username."
          );
          return;
        }

        account = existing;
        if (role === "creator" && !account.creatorPlan) account.creatorPlan = "calls";
      }

      let economyAccount;

      try {
        economyAccount = await initializeTestAccount(
          account.username,
          account.role,
          account.gender || ""
        );
      } catch (error) {
        setMessage(
          `Your local account was ${
            mode === "signup" ? "created" : "verified"
          }, but the test server could not initialize it. Check that Render has deployed the updated index.js, then try again. Details: ${error.message}`
        );
        return;
      }

      const session = {
        username: account.username,
        role: account.role,
        creatorPlan: account.creatorPlan || "calls",
        subscriptionPrice: Number(account.subscriptionPrice || 0),
        subscriptionHours: [3, 5, 7, 24].includes(Number(account.subscriptionHours)) ? Number(account.subscriptionHours) : 24,
        loggedInAt: new Date().toISOString(),
        testMode: true,
        coins: economyAccount.coins ?? 0,
        testBonusInr: economyAccount.testBonusInr ?? 0,
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(session));

      window.location.replace(getSafeNextPath(account.role));
    } catch (error) {
      setMessage(
        error?.message ||
          "Browser storage is unavailable. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setMessage("");
    setPassword("");
    setConfirmPassword("");

    const nextPath = nextMode === "signup" ? "/signup" : "/login";
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const query = next ? `?next=${encodeURIComponent(next)}` : "";

    window.history.replaceState({}, "", `${nextPath}${query}`);
  }

  function changeRole(nextRole) {
    setRole(nextRole);
    setGender("");
    setMessage("");
  }

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <a href="/" className="auth-brand">
          OnlyStream<span>.</span>
        </a>

        <a href="/" className="auth-back">
          <ArrowLeft size={17} />
          Home
        </a>
      </header>

      <section className="auth-card">
        <div className="auth-icon">
          {role === "creator" ? (
            <Video size={25} />
          ) : (
            <UserRound size={25} />
          )}
        </div>

        <p className="auth-eyebrow">ONLYSTREAM ACCOUNT</p>

        <h1>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>

        <p className="auth-description">
          {mode === "signup"
            ? "Choose your account type to get started."
            : "Log in to continue to OnlyStream."}
        </p>

        <div className="auth-role-picker">
          <button
            type="button"
            className={role === "user" ? "auth-role active" : "auth-role"}
            onClick={() => changeRole("user")}
            disabled={busy}
          >
            <UserRound size={19} />
            <span>User</span>
          </button>

          <button
            type="button"
            className={role === "creator" ? "auth-role active" : "auth-role"}
            onClick={() => changeRole("creator")}
            disabled={busy}
          >
            <Video size={19} />
            <span>Creator</span>
          </button>
        </div>

        {role === "creator" && (
          <div className="auth-creator-bonus">
            <strong>₹1,200 Creator Welcome Bonus</strong>
            <span>
              Promotional bonus only. It cannot be
              withdrawn.
            </span>
          </div>
        )}

        {mode === "signup" && role === "creator" && (
          <div className="creator-plan-picker">
            <p className="creator-plan-title">Choose how you want to earn</p>
            <div className="creator-plan-options">
              <button type="button" className={`creator-plan-card ${creatorPlan === "calls" ? "selected" : ""}`} onClick={() => setCreatorPlan("calls")} disabled={busy}>
                <span className="creator-plan-tag">POPULAR</span><strong>Call Earning</strong><span>Go live, receive paid calls and earn per call using the existing coin system.</span><b>Earn from calls</b>
              </button>
              <button type="button" className={`creator-plan-card ${creatorPlan === "subscription" ? "selected" : ""}`} onClick={() => setCreatorPlan("subscription")} disabled={busy}>
                <span className="creator-plan-tag subscription-tag">LIFETIME ACCESS</span><strong>Subscription Creator</strong><span>Set a one-time fee. Subscribers get lifetime access to your live streams, photos and videos, but cannot call you.</span><b>One-time payment</b>
              </button>
            </div>
            {creatorPlan === "subscription" && <>
              <div className="creator-price-field creator-hours-field">
                <label>Choose exclusive rent duration</label>
                <div className="creator-hours-options" role="group" aria-label="Exclusive rent duration">
                  {[3, 5, 7, 24].map(hours => <button key={hours} type="button" className={`creator-hours-option ${Number(subscriptionHours) === hours ? "selected" : ""}`} onClick={() => setSubscriptionHours(String(hours))} disabled={busy}>{hours} Hours{hours === 24 ? " · Existing" : " Rent"}</button>)}
                </div>
                <small>Your creator card will appear in the matching homepage section. Existing 24-hour access stays available.</small>
              </div>
              <div className="creator-price-field"><label htmlFor="creator-subscription-price">One-time access price (₹)</label><input id="creator-subscription-price" type="number" min="1" max="100000" step="1" value={subscriptionPrice} onChange={e => setSubscriptionPrice(e.target.value)} required disabled={busy}/><small>Set the one-time access price for your creator page.</small></div>
            </>}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && role === "creator" && (
            <>
              <label htmlFor="auth-gender">Gender</label>

              <select
                id="auth-gender"
                value={gender}
                onChange={(event) => {
                  setGender(event.target.value);
                  setMessage("");
                }}
                required
                disabled={busy}
              >
                <option value="">Select gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>

              <p className="auth-gender-note">
                Creator signup is currently available only for Female.
              </p>
            </>
          )}

          <label htmlFor="auth-username">Username</label>

          <input
            id="auth-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter a username"
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_.-]+"
            required
            disabled={busy}
          />

          <label htmlFor="auth-password">Password</label>

          <div className="auth-password-wrap">
            <input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              minLength={6}
              required
              disabled={busy}
            />

            <button
              type="button"
              className="auth-show-password"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              disabled={busy}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>

          {mode === "signup" && (
            <>
              <label htmlFor="auth-confirm-password">
                Confirm password
              </label>

              <input
                id="auth-confirm-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Enter password again"
                minLength={6}
                required
                disabled={busy}
              />
            </>
          )}

          {message && (
            <p className="auth-message" role="alert">
              {message}
            </p>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            <LockKeyhole size={18} />

            {busy
              ? "Please wait..."
              : mode === "signup"
                ? "Create Account"
                : "Log In"}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "signup"
            ? "Already have an account?"
            : "New to OnlyStream?"}{" "}
          <button
            type="button"
            onClick={() =>
              changeMode(mode === "signup" ? "login" : "signup")
            }
            disabled={busy}
          >
            {mode === "signup" ? "Log in" : "Sign up"}
          </button>
        </p>
      </section>
    </main>
  );
}
