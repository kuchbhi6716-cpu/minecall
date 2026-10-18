
import React, { useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  UserRound,
  Radio,
  LoaderCircle,
} from "lucide-react";
import "./AuthPage.css";

const SESSION_KEY = "onlystream-test-session-v1";

export default function AuthPage({ initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState("user");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    try {
      const endpoint =
        mode === "signup"
          ? "/api/test-auth/signup"
          : "/api/test-auth/login";

      const payload = {
        username: username.trim(),
        password,
      };

      if (mode === "signup") {
        payload.role = role;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          token: data.token,
          user: data.user,
        })
      );

      window.location.href =
        data.user.role === "creator" ? "/creator" : "/";
    } catch (error) {
      setMessage(
        error.message ||
          "Could not connect to the server. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setMessage("");
    window.history.replaceState(
      {},
      "",
      nextMode === "signup" ? "/signup" : "/login"
    );
  }

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <a className="auth-brand" href="/">
          <span className="auth-icon">
            <Radio size={21} />
          </span>
          <span>OnlyStream</span>
        </a>

        <a className="auth-back" href="/">
          <ArrowLeft size={16} />
          Back home
        </a>
      </header>

      <section className="auth-card">
        <div className="auth-eyebrow">
          {mode === "signup" ? "JOIN ONLYSTREAM" : "WELCOME BACK"}
        </div>

        <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>

        <p className="auth-description">
          {mode === "signup"
            ? "Choose your account type to get started."
            : "Log in to continue to OnlyStream."}
        </p>

        {mode === "signup" && (
          <div className="auth-role-picker">
            <button
              type="button"
              className={`auth-role ${role === "user" ? "active" : ""}`}
              onClick={() => setRole("user")}
            >
              <UserRound size={19} />
              <span>User</span>
              <small>Watch and call</small>
            </button>

            <button
              type="button"
              className={`auth-role ${role === "creator" ? "active" : ""}`}
              onClick={() => setRole("creator")}
            >
              <Radio size={19} />
              <span>Creator</span>
              <small>Go live</small>
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="auth-username">Username</label>
          <input
            id="auth-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your username"
            minLength={3}
            maxLength={32}
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
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {message && (
            <p className="auth-message" role="alert">
              {message}
            </p>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={18} className="auth-spinner" />
                Please wait...
              </>
            ) : mode === "signup" ? (
              "Create account"
            ) : (
              "Log in"
            )}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "signup" ? "Already have an account?" : "New to OnlyStream?"}{" "}
          <button
            type="button"
            onClick={() =>
              switchMode(mode === "signup" ? "login" : "signup")
            }
          >
            {mode === "signup" ? "Log in" : "Sign up"}
          </button>
        </p>

        <p className="auth-testing-note">
          Test mode: accounts are temporary and reset when the server restarts.
          No real payments are made.
        </p>
      </section>
    </main>
  );
}
