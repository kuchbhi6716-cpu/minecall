
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

export default function AuthPage({ initialMode = "login" }) {
  const [mode, setMode] = useState(
    initialMode === "signup" ? "signup" : "login"
  );
  const [role, setRole] = useState("user");
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

    if (cleanUsername.length < 3) {
      setMessage("Username must contain at least 3 characters.");
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

    setBusy(true);

    try {
      const accounts = readAccounts();
      const passwordHash = await hashPassword(password);

      const existing = accounts.find(
        (account) => account.username === cleanUsername
      );

      if (mode === "signup") {
        if (existing) {
          setMessage("That username already exists. Please log in.");
          return;
        }

        const account = {
          username: cleanUsername,
          role,
          passwordHash,
          ...(role === "user" ? { testCoins: 0 } : {}),
          createdAt: new Date().toISOString(),
        };

        localStorage.setItem(
          ACCOUNTS_KEY,
          JSON.stringify([...accounts, account])
        );

        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            username: account.username,
            role: account.role,
            loggedInAt: new Date().toISOString(),
          })
        );

        window.location.href = role === "creator" ? "/creator" : "/";
        return;
      }

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

      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          username: existing.username,
          role: existing.role,
          loggedInAt: new Date().toISOString(),
        })
      );

      window.location.href = existing.role === "creator" ? "/creator" : "/";
    } catch {
      setMessage(
        "Browser storage is unavailable. Please try another browser or session."
      );
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setMessage("");
    setConfirmPassword("");

    const nextPath = nextMode === "signup" ? "/signup" : "/login";
    window.history.replaceState({}, "", nextPath);
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
            onClick={() => {
              setRole("user");
              setMessage("");
            }}
          >
            <UserRound size={19} />
            <span>User</span>
          </button>

          <button
            type="button"
            className={role === "creator" ? "auth-role active" : "auth-role"}
            onClick={() => {
              setRole("creator");
              setMessage("");
            }}
          >
            <Video size={19} />
            <span>Creator</span>
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
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
            required
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
            />

            <button
              type="button"
              className="auth-show-password"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
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
          >
            {mode === "signup" ? "Log in" : "Sign up"}
          </button>
        </p>

        <p className="auth-testing-note">
          Testing version: accounts are stored only in this browser. Do not
          use a real or reused password. This is not production authentication.
        </p>
      </section>
    </main>
  );
}
