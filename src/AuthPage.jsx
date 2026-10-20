
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

  if (role === "creator") return "/creator";

  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\") &&
    !/^\/(?:login|signup|creator)(?:[/?#]|$)/i.test(next)
  ) {
    return next;
  }

  return "/";
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
        loggedInAt: new Date().toISOString(),
        testMode: true,
        coins: economyAccount.coins ?? 0,
        testBonusInr: economyAccount.testBonusInr ?? 0,
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(session));

      // Newly registered users always go to the homepage.
      // Creator signup and existing login redirects remain unchanged.
      const destination =
        mode === "signup" && account.role === "user"
          ? "/"
          : getSafeNextPath(account.role);

      window.location.replace(destination);
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
              Test/demo bonus only. It is not real money and cannot be
              withdrawn.
            </span>
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

        <p className="auth-testing-note">
          Testing version: accounts are stored in this browser and the test
          economy is stored in server memory. Do not use a real or reused
          password. No real payments or withdrawals are enabled.
        </p>
      </section>
    </main>
  );
}
