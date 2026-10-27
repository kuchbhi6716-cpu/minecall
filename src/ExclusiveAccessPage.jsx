import React, { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { loadSupabaseAccount } from "./supabaseAccount";
import { ArrowLeft, CheckCircle2, Clock3, LockKeyhole, ShieldCheck, Video, MessageCircle, RefreshCw } from "lucide-react";
import "./ExclusiveAccessPage.css";

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function ExclusiveAccessPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const creator = (params.get("creator") || params.get("subscriptionCreator") || "").trim();
  const queryPrice = Math.max(1, Number(params.get("price") || params.get("subscriptionPrice")) || 499);
  const queryHours = [3, 5, 10, 24].includes(Number(params.get("hours"))) ? Number(params.get("hours")) : 24;
  const [session, setSession] = useState(null);
  const [price, setPrice] = useState(queryPrice);
  const [hours, setHours] = useState(queryHours);
  const [occupied, setOccupied] = useState(false);
  const [owned, setOwned] = useState(false);
  const [creatorAvailable, setCreatorAvailable] = useState(true);
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const callUrl = `/call?creator=${encodeURIComponent(creator)}&exclusive=1`;
  const loginUrl = `/login?next=${encodeURIComponent(`/exclusive-access?creator=${encodeURIComponent(creator)}&price=${queryPrice}&hours=${queryHours}`)}`;

  const refreshStatus = useCallback(async () => {
    if (!creator) {
      setError("Creator was not specified.");
      setLoading(false);
      return;
    }
    try {
      setError("");
      const current = await loadSupabaseAccount();
      if (!current || current.role !== "user" || !current.accessToken) {
        window.location.href = loginUrl;
        return;
      }
      if (session?.accessToken !== current.accessToken) setSession(current);
      const response = await fetch(`/api/exclusive-access/status?creator=${encodeURIComponent(creator)}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${current.accessToken}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check creator availability.");
      setPrice(Math.max(1, Number(data.price) || queryPrice));
      setHours([3, 5, 10, 24].includes(Number(data.hours)) ? Number(data.hours) : queryHours);
      setOccupied(Boolean(data.occupied));
      setOwned(Boolean(data.owned));
      setCreatorAvailable(Boolean(data.creatorAvailable));
      setExpiresAt(data.expiresAt || null);
      setRemainingMs(Number(data.remainingMs) || 0);
    } catch (e) {
      setError(e.message || "Could not check creator availability.");
    } finally {
      setLoading(false);
    }
  }, [creator, queryPrice, queryHours, session, loginUrl]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const current = await loadSupabaseAccount();
        if (!active) return;
        if (current?.role === "creator") { window.location.replace("/"); return; }
        if (!current || current.role !== "user") { window.location.replace(loginUrl); return; }
        setSession(current);
      } catch (error) {
        console.error("Could not load Supabase account:", error);
        if (active) window.location.replace(loginUrl);
      }
    })();
    return () => { active = false; };
  }, [loginUrl]);

  useEffect(() => { if (session?.role === "user") void refreshStatus(); }, [session, refreshStatus]);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = () => setRemainingMs(Math.max(0, Number(expiresAt) - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  async function purchaseAccess() {
    if (buying || occupied) return;
    setBuying(true);
    setError("");
    setNotice("");
    let socket;
    try {
      // Supabase is the identity source. Refresh/load the current account before
      // bridging it to the existing server-side purchase ledger.
      const current = await loadSupabaseAccount();
      if (!current || current.role !== "user" || !current.username || !current.accessToken) {
        window.location.href = loginUrl;
        return;
      }
      setSession(current);

      const bootstrapResponse = await fetch("/api/test-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          username: current.username,
          role: "user",
          gender: current.gender || "",
          accessToken: current.accessToken,
        }),
        cache: "no-store",
      });
      const bootstrapResult = await bootstrapResponse.json().catch(() => ({}));
      if (!bootstrapResponse.ok) {
        throw new Error(bootstrapResult.error || "Could not prepare your account for purchase. Please log in again.");
      }

      socket = io({
        transports: ["websocket", "polling"],
        auth: { accessToken: current.accessToken },
      });
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Payment server connection timed out. Please retry.")), 10000);
        socket.once("connect", () => { window.clearTimeout(timeout); resolve(); });
        socket.once("connect_error", (e) => { window.clearTimeout(timeout); reject(e || new Error("Could not connect to payment server.")); });
      });
      const result = await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Purchase confirmation timed out. Please refresh availability before retrying.")), 10000);
        socket.emit("exclusive-access-purchase", {
          creatorUsername: creator,
          buyerUsername: current.username,
          amount: price,
          transactionId: `exclusive-${current.id || current.username}-${creator}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }, (response) => { window.clearTimeout(timeout); resolve(response); });
      });
      if (!result?.ok) {
        if (result?.expiresAt) {
          setOccupied(true);
          setExpiresAt(result.expiresAt);
          setRemainingMs(Number(result.remainingMs) || 0);
        }
        throw new Error(result?.error || "Could not reserve this creator.");
      }
      setOwned(true);
      setOccupied(false);
      setExpiresAt(result.expiresAt);
      setRemainingMs(Number(result.remainingMs) || hours * 60 * 60 * 1000);
      setNotice("Your exclusive access is now active.");
      window.location.href = callUrl;
    } catch (e) {
      setError(e?.message || "Could not complete this purchase.");
      await refreshStatus();
    } finally {
      socket?.disconnect();
      setBuying(false);
    }
  }

  if (!session || session.role !== "user") {
    return <main className="exclusive-access-page"><div className="exclusive-access-card"><p>Redirecting to login…</p></div></main>;
  }

  return (
    <main className="exclusive-access-page">
      <header className="exclusive-access-header">
        <a href="/" className="exclusive-back"><ArrowLeft size={17} /> Home</a>
        <a href="/" className="exclusive-brand">OnlyStream<span>.</span></a>
        
      </header>
      <section className="exclusive-access-card">
        <div className="exclusive-access-icon"><LockKeyhole size={30} /></div>
        <span className="exclusive-kicker">${{3:7,5:15,10:22,24:44}[hours]}-MINUTE EXCLUSIVE ACCESS</span>
        <h1>{creator || "Creator"}</h1>
        <p className="exclusive-description">Reserve this creator for ${{3:7,5:15,10:22,24:44}[hours]} minutes. During your access period, you can start unlimited video calls and chat without spending coins.</p>
        <div className="exclusive-feature-list">
          <div><Video size={19} /><span>Unlimited video calls during access</span><CheckCircle2 size={17} /></div>
          <div><MessageCircle size={19} /><span>Unlimited chat during access</span><CheckCircle2 size={17} /></div>
          <div><Clock3 size={19} /><span>${{3:7,5:15,10:22,24:44}[hours]} minutes from confirmed purchase</span><CheckCircle2 size={17} /></div>
        </div>
        {loading ? <p className="exclusive-status">Checking availability…</p> : null}
        {!loading && owned ? (
          <div className="exclusive-owned">
            <strong><CheckCircle2 size={18} /> Your access is active</strong>
            <span>Time remaining: {formatRemaining(remainingMs)}</span>
            <button type="button" onClick={() => { window.location.href = callUrl; }}>Call creator</button>
          </div>
        ) : !loading && occupied ? (
          <div className="exclusive-occupied">
            <strong>This creator is reserved</strong>
            <p>Another user currently has exclusive access. Try again when the timer expires.</p>
            {expiresAt && <span>Time remaining: {formatRemaining(remainingMs)}</span>}
            <button type="button" className="exclusive-secondary-button" onClick={refreshStatus}><RefreshCw size={16} /> Refresh availability</button>
          </div>
        ) : (
          <div className="exclusive-purchase">
            <div className="exclusive-price-row"><span>One-time access fee</span><strong>₹{price.toLocaleString("en-IN")}</strong></div>
            <p className="exclusive-small-note">One purchase · ${{3:7,5:15,10:22,24:44}[hours]} minutes · No call coins</p>
            <button type="button" onClick={purchaseAccess} disabled={buying || loading || !creatorAvailable}>
              {buying ? "Confirming…" : !creatorAvailable ? "Creator is offline" : `Pay ₹${price.toLocaleString("en-IN")}`}
            </button>
          </div>
        )}
        {!creatorAvailable && !occupied && !owned && !loading && <p className="exclusive-status">This creator is currently offline. You can purchase access when they are available.</p>}
        {notice && <p className="exclusive-success">{notice}</p>}
        {error && <p className="exclusive-error" role="alert">{error}</p>}
        <p className="exclusive-disclaimer"><ShieldCheck size={15} /> Secure payment processing is being prepared.</p>
      </section>
    </main>
  );
}
