import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  UserRound,
  Video,
  Mail,
} from "lucide-react";
import { supabase } from "./supabaseClient";

const SESSION_KEY = "onlystream-test-session-v1";
const PENDING_OAUTH_KEY = "onlystream-pending-oauth-profile-v1";

function getSafeNextPath(role, creatorPlan) {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  const safeNext = Boolean(
    next && next.startsWith("/") && !next.startsWith("//") &&
    !next.includes("\\") && !/^\/(?:login|signup|creator)(?:[/?#]|$)/i.test(next)
  );
  if (role === "creator") return creatorPlan === "subscription" ? "/subscription-creator" : "/creator";
  return safeNext ? next : "/";
}

function normalizedProfile(profile, authUser) {
  const metadata = authUser?.user_metadata || {};
  const emailName = (authUser?.email || "").split("@")[0].toLowerCase();
  return {
    id: authUser?.id || profile?.id || "",
    email: authUser?.email || "",
    username: profile?.username || metadata.username || emailName || `user_${String(authUser?.id || "").replaceAll("-", "").slice(0, 12)}`,
    role: profile?.role || metadata.role || "user",
    creatorPlan: profile?.creator_plan || metadata.creator_plan || "calls",
    subscriptionPrice: Number(profile?.subscription_price ?? metadata.subscription_price ?? 0),
    subscriptionHours: Number(profile?.subscription_hours ?? metadata.subscription_hours ?? 24),
    gender: profile?.gender || metadata.gender || "",
  };
}

async function saveCompatibilitySession(user, profile) {
  const account = normalizedProfile(profile, user);
  const { data: walletData } = await supabase
    .from("wallets")
    .select("coin_balance")
    .eq("user_id", user.id)
    .maybeSingle();
  const session = {
    ...account,
    loggedInAt: new Date().toISOString(),
    authProvider: user.app_metadata?.provider || "email",
    testMode: true,
    coins: Number(walletData?.coin_balance ?? 0),
    testBonusInr: 0,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return account;
}

function cleanUsername(value) {
  return value.trim().toLowerCase();
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
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function finishOAuthIfPresent() {
      const { data, error } = await supabase.auth.getSession();
      if (!active || error || !data.session?.user) return;
      const user = data.session.user;
      let pending = null;
      try { pending = JSON.parse(sessionStorage.getItem(PENDING_OAUTH_KEY) || "null"); } catch {}
      if (pending) {
        const patch = {
          username: pending.username,
          role: pending.role,
          gender: pending.role === "creator" ? pending.gender : "",
          creator_plan: pending.role === "creator" ? pending.creatorPlan : "calls",
          subscription_price: pending.role === "creator" && pending.creatorPlan === "subscription" ? Math.max(1, Number(pending.subscriptionPrice) || 1) : 0,
          subscription_hours: [3, 5, 7, 24].includes(Number(pending.subscriptionHours)) ? Number(pending.subscriptionHours) : 24,
        };
        const { error: updateError } = await supabase.from("profiles").update(patch).eq("id", user.id);
        if (updateError) {
          setMessage("Google sign-in worked, but profile setup failed. Run the Supabase profile policies SQL file, then try again.");
          return;
        }
        sessionStorage.removeItem(PENDING_OAUTH_KEY);
      }
      const { data: profileData, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (profileError) {
        setMessage("Login succeeded, but the profile could not be loaded. Please check the Supabase RLS policies.");
        return;
      }
      const account = await saveCompatibilitySession(user, profileData);
      window.location.replace(getSafeNextPath(account.role, account.creatorPlan));
    }
    finishOAuthIfPresent();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") localStorage.removeItem(SESSION_KEY);
      if (event === "SIGNED_IN" && session?.user && window.location.pathname !== "/login" && window.location.pathname !== "/signup") {
        // The auth page effect handles redirect completion on the auth routes.
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = cleanUsername(username);

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setMessage("Please enter a valid email address."); return;
    }
    if (mode === "signup" && !/^[a-z0-9_.-]{3,30}$/.test(cleanName)) {
      setMessage("Username must be 3–30 characters and use only letters, numbers, dots, underscores or hyphens."); return;
    }
    if (password.length < 6) { setMessage("Password must contain at least 6 characters."); return; }
    if (mode === "signup" && password !== confirmPassword) { setMessage("Passwords do not match."); return; }
    if (mode === "signup" && role === "creator" && gender !== "female") {
      setMessage("Creator signup is currently available only to users who select Female."); return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const metadata = {
          username: cleanName,
          role,
          gender: role === "creator" ? gender : "",
          creator_plan: role === "creator" ? creatorPlan : "calls",
          subscription_price: role === "creator" && creatorPlan === "subscription" ? Math.max(1, Number(subscriptionPrice) || 1) : 0,
          subscription_hours: [3, 5, 7, 24].includes(Number(subscriptionHours)) ? Number(subscriptionHours) : 24,
        };
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: metadata, emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage("Account created! Check your email and confirm it, then log in.");
          return;
        }
        const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
        if (profileError) throw new Error("Account created, but profile access is blocked. Run the Supabase profile policies SQL file.");
        const account = await saveCompatibilitySession(data.user, profile);
        window.location.replace(getSafeNextPath(account.role, account.creatorPlan));
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
        if (profileError) throw new Error("Logged in, but profile access is blocked. Run the Supabase profile policies SQL file.");
        if (profile?.role !== role) throw new Error(`This account is registered as ${profile?.role || "user"}. Choose the correct account type.`);
        const account = await saveCompatibilitySession(data.user, profile);
        window.location.replace(getSafeNextPath(account.role, account.creatorPlan));
      }
    } catch (error) {
      setMessage(error?.message || "Could not complete authentication. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setMessage("");
    if (mode === "signup" && !/^[a-z0-9_.-]{3,30}$/.test(cleanUsername(username))) {
      setMessage("Enter a valid username before continuing with Google."); return;
    }
    if (mode === "signup" && role === "creator" && gender !== "female") {
      setMessage("Creator signup is currently available only to users who select Female."); return;
    }
    const metadata = {
      username: mode === "signup" ? cleanUsername(username) : "",
      role: mode === "signup" ? role : "user",
      gender: mode === "signup" && role === "creator" ? gender : "",
      creatorPlan: mode === "signup" ? creatorPlan : "calls",
      subscriptionPrice,
      subscriptionHours,
    };
    if (mode === "signup") sessionStorage.setItem(PENDING_OAUTH_KEY, JSON.stringify(metadata));
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${mode === "signup" ? "/signup" : "/login"}`,
               queryParams: {
                 prompt: "select_account",
               },
               },
    });
    if (error) { setBusy(false); setMessage(error.message || "Google sign-in could not start."); }
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

          <label htmlFor="auth-email">Email address</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            disabled={busy}
          />

          {mode === "signup" && <>
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Choose a username"
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_.-]+"
              required
              disabled={busy}
            />
          </>}

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

        <button type="button" className="auth-google-button" onClick={handleGoogleSignIn} disabled={busy}>
          <Mail size={18} />
          {busy ? "Please wait..." : "Continue with Google"}
        </button>

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
