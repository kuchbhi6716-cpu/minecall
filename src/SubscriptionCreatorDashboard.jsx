import React, { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Camera, CameraOff, Mic, MicOff, Radio, RefreshCw, LogOut, Wallet, ImagePlus, Video, Trash2, TrendingUp } from "lucide-react";

const SESSION_KEY = "onlystream-test-session-v1";
const LIVE_KEY = "onlystream-subscription-live-v1";
const earningKey = (name) => `onlystream-subscription-earnings-${String(name || "creator").toLowerCase()}`;

export default function SubscriptionCreatorDashboard() {
  const [username, setUsername] = useState("Creator");
  const [price, setPrice] = useState(499);
  const [isLive, setIsLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facing, setFacing] = useState("user");
  const [status, setStatus] = useState("You are offline");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [viewers, setViewers] = useState(0);
  const [earnings, setEarnings] = useState({ today: 0, week: 0, month: 0, total: 0, transactions: 0 });
  const [media, setMedia] = useState([]);
  const [mediaNotice, setMediaNotice] = useState("");
  const mediaInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const liveRef = useRef(false);

  const stopStream = useCallback(() => {
    peersRef.current.forEach((peer) => { try { peer.close(); } catch {} });
    peersRef.current.clear();
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let session;
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch {}
    if (!session || session.role !== "creator") { window.location.replace("/login?next=%2Fsubscription-creator"); return; }
    if (session.creatorPlan !== "subscription") { window.location.replace("/creator"); return; }
    setUsername(session.username || "Creator");
    setPrice(Math.max(1, Number(session.subscriptionPrice) || 499));
    const loadMedia = () => socketRef.current?.emit("subscription-media-get", { username: session.username }, (response) => {
      if (response?.ok) setMedia(Array.isArray(response.items) ? response.items : []);
      else setMediaNotice(response?.error || "Could not load subscriber gallery.");
    });
    const loadEarnings = () => socketRef.current?.emit("subscription-earnings-get", { username: session.username }, (data) => {
      if (data?.ok) setEarnings(data.earnings || { today: 0, week: 0, month: 0, total: 0, transactions: 0 });
    });
    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => { socket.emit("get-live-creators"); setError(""); loadEarnings(); loadMedia(); });
    socket.on("subscription-earnings-updated", (data) => {
      if (String(data?.username || "").toLowerCase() === String(session.username || "").toLowerCase()) loadEarnings();
    });
    socket.on("connect_error", () => setError("Server connection failed. Check the deployment and retry."));
    socket.on("subscription-viewer-joined", async (data) => {
      if (!liveRef.current || !streamRef.current || !data?.viewerSocketId) return;
      const viewerId = data.viewerSocketId;
      try {
        const old = peersRef.current.get(viewerId); if (old) old.close();
        const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] });
        peersRef.current.set(viewerId, peer);
        streamRef.current.getTracks().forEach(track => peer.addTrack(track, streamRef.current));
        peer.onicecandidate = (event) => { if (event.candidate && socket.connected) socket.emit("subscription-live-signal", { username: session.username, targetSocketId: viewerId, type: "candidate", candidate: event.candidate }); };
        peer.onconnectionstatechange = () => { if (["failed", "closed", "disconnected"].includes(peer.connectionState)) { try { peer.close(); } catch {} peersRef.current.delete(viewerId); } };
        const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
        socket.emit("subscription-live-signal", { username: session.username, targetSocketId: viewerId, type: "offer", offer: peer.localDescription });
        setViewers(peersRef.current.size);
      } catch (e) { setError("Could not connect to a subscriber video session."); }
    });
    socket.on("subscription-live-signal", async (data) => {
      if (!data || String(data.username || "").toLowerCase() !== String(session.username).toLowerCase()) return;
      const peer = peersRef.current.get(data.fromSocketId); if (!peer) return;
      try {
        if (data.type === "answer" && data.answer && !peer.currentRemoteDescription) await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
        if (data.type === "candidate" && data.candidate) await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch {}
    });
    socket.on("subscription-chat-message", (item) => { if (String(item?.username || "").toLowerCase() === String(session.username).toLowerCase()) setMessages(old => [...old, { id: item.id || `${Date.now()}-${Math.random()}`, name: item.name || "Subscriber", text: item.text || "" }]); });
    socket.on("disconnect", () => setStatus(liveRef.current ? "Reconnecting…" : "You are offline"));
    return () => { socket.removeAllListeners(); socket.disconnect(); stopStream(); };
  }, [stopStream]);

  async function goLive() {
    if (busy || liveRef.current) return; setBusy(true); setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true });
      streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      const socket = socketRef.current; if (!socket?.connected) throw new Error("Server is not connected. Retry in a moment.");
      socket.emit("creator-go-live", { username, creatorPlan: "subscription", subscriptionPrice: price }, (response) => {
        if (response?.ok === false) { setError(response.error || "Could not start live."); stopStream(); setBusy(false); return; }
        liveRef.current = true; setIsLive(true); setStatus("LIVE NOW · Subscribers can join");
        localStorage.setItem(LIVE_KEY, JSON.stringify({ username, isLive: true, startedAt: new Date().toISOString(), creatorPlan: "subscription", subscriptionPrice: price }));
      });
    } catch (e) { stopStream(); setError(e?.message || "Camera or microphone permission was denied."); }
    finally { setBusy(false); }
  }
  function endLive() {
    liveRef.current = false; setIsLive(false); setStatus("You are offline");
    socketRef.current?.emit("creator-end-live"); stopStream();
    try { localStorage.removeItem(LIVE_KEY); } catch {}
    setViewers(0);
  }
  function toggleMic() { const next = !muted; setMuted(next); streamRef.current?.getAudioTracks().forEach(t => t.enabled = !next); }
  function toggleCamera() { const next = !cameraOff; setCameraOff(next); streamRef.current?.getVideoTracks().forEach(t => t.enabled = !next); }
  async function flipCamera() {
    if (!streamRef.current) return; const next = facing === "user" ? "environment" : "user";
    try { const replacement = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next }, audio: false }); const track = replacement.getVideoTracks()[0];
      const old = streamRef.current.getVideoTracks()[0];
      for (const peer of peersRef.current.values()) { const sender = peer.getSenders().find(s => s.track?.kind === "video"); if (sender) await sender.replaceTrack(track); }
      if (old) { streamRef.current.removeTrack(old); old.stop(); } streamRef.current.addTrack(track); if (videoRef.current) videoRef.current.srcObject = streamRef.current; setFacing(next); setCameraOff(false);
    } catch { setError("Could not switch camera on this device."); }
  }
  async function refreshEarnings() {
    const socket = socketRef.current;
    if (!socket?.connected) { setError("Earnings refresh nahi ho saka: server disconnected hai."); return; }
    socket.emit("subscription-earnings-get", { username }, (data) => {
      if (data?.ok) { setEarnings(data.earnings || { today: 0, week: 0, month: 0, total: 0, transactions: 0 }); setError(""); }
      else setError(data?.error || "Earnings load nahi ho paayi.");
    });
  }
  async function uploadMedia(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const socket = socketRef.current;
    if (!socket?.connected) { setMediaNotice("Server is offline. Reconnect and try uploading again."); return; }
    setMediaNotice("Uploading selected files…");
    let uploaded = 0;
    let skipped = 0;
    for (const file of files) {
      if ((!file.type.startsWith("image/") && !file.type.startsWith("video/")) || file.size > 2 * 1024 * 1024) { skipped++; continue; }
      try {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Could not read file"));
          reader.readAsDataURL(file);
        });
        const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, type: file.type.startsWith("video/") ? "video" : "photo", data };
        const response = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Upload timed out. Try a smaller file.")), 15000);
          socket.emit("subscription-media-upload", { username, item }, (result) => { clearTimeout(timer); if (result?.ok) resolve(result); else reject(new Error(result?.error || "Upload failed")); });
        });
        setMedia(Array.isArray(response.items) ? response.items : old => [...old, item]);
        uploaded++;
      } catch (err) { skipped++; }
    }
    setMediaNotice(`${uploaded} file(s) uploaded and shared with subscribers.${skipped ? ` ${skipped} file(s) skipped; use image/video files under 2 MB each and check server connection.` : ""}`);
  }
  async function deleteMedia(id) {
    const socket = socketRef.current;
    if (!socket?.connected) { setMediaNotice("Server is offline. Reconnect before deleting uploads."); return; }
    socket.emit("subscription-media-delete", { username, id }, (response) => {
      if (response?.ok) { setMedia(Array.isArray(response.items) ? response.items : []); setMediaNotice("Upload removed from your subscriber gallery."); }
      else setMediaNotice(response?.error || "Could not delete upload.");
    });
  }
  function sendMessage(e) { e.preventDefault(); const text = message.trim(); if (!text || !isLive || !socketRef.current?.connected) return; socketRef.current.emit("subscription-chat-message", { username, name: username, text }); setMessage(""); }
  function logout() { endLive(); try { localStorage.removeItem(SESSION_KEY); } catch {} window.location.replace("/"); }

  return <main className="sub-creator-page">
    <header className="sub-creator-top"><a href="/" className="sub-creator-logo">OnlyStream<span>.</span></a><span className="sub-creator-plan">SUBSCRIPTION CREATOR</span><button onClick={logout} className="sub-creator-logout"><LogOut size={16}/> Logout</button></header>
    <section className="sub-creator-heading"><div><span className="sub-creator-kicker">CREATOR STUDIO</span><h1>Welcome, {username}</h1><p>Subscription live room · One-time lifetime access · No paid-call queue</p></div><div className={isLive ? "sub-creator-status live" : "sub-creator-status"}><i/> {status}</div></section>
    {error && <p className="sub-creator-error">{error}</p>}
    <section className="sub-creator-grid"><div className="sub-creator-main"><div className="sub-creator-player"><video ref={videoRef} autoPlay muted playsInline controls aria-label="Your subscription live preview"/><span className="sub-creator-player-label">{isLive ? "LIVE PREVIEW" : "CAMERA PREVIEW"}</span>{!isLive && <div className="sub-creator-placeholder"><Camera size={34}/><strong>Your live preview</strong><span>Tap Go Live to start your subscription stream.</span></div>}</div>
      <div className="sub-creator-controls">{!isLive ? <button className="sub-creator-go" onClick={goLive} disabled={busy}><Radio size={18}/>{busy ? "Starting camera…" : "Go Live"}</button> : <button className="sub-creator-end" onClick={endLive}>End Live</button>}<button onClick={toggleMic} disabled={!isLive}>{muted ? <MicOff size={17}/> : <Mic size={17}/>} {muted ? "Unmute" : "Mute mic"}</button><button onClick={toggleCamera} disabled={!isLive}>{cameraOff ? <CameraOff size={17}/> : <Camera size={17}/>} {cameraOff ? "Camera on" : "Camera off"}</button><button onClick={flipCamera} disabled={!isLive}><RefreshCw size={17}/> Flip camera</button><span className="sub-creator-viewer-count">{viewers} connected viewer{viewers === 1 ? "" : "s"}</span></div>
      <section className="sub-creator-earnings-panel"><div className="sub-creator-section-heading"><div><span className="sub-creator-kicker">YOUR REVENUE</span><h2>Subscription earnings</h2></div><button className="sub-creator-refresh" onClick={refreshEarnings}><RefreshCw size={15}/> Refresh earnings</button></div><div className="sub-creator-earnings-grid"><article className="sub-creator-earnings sub-creator-total"><div className="sub-creator-earnings-icon"><Wallet size={22}/></div><div><span>TOTAL EARNED</span><strong>₹{Number(earnings.total || 0).toFixed(2)}</strong><small>{earnings.transactions || 0} demo subscription payments</small></div></article><article className="sub-creator-earning-stat"><span><TrendingUp size={15}/> TODAY</span><strong>₹{Number(earnings.today || 0).toFixed(2)}</strong></article><article className="sub-creator-earning-stat"><span>LAST 7 DAYS</span><strong>₹{Number(earnings.week || 0).toFixed(2)}</strong></article><article className="sub-creator-earning-stat"><span>LAST 30 DAYS</span><strong>₹{Number(earnings.month || 0).toFixed(2)}</strong></article></div><p className="sub-creator-earnings-footnote">Demo ledger stored by the running server. Demo payments only — not real payouts.</p></section>
      <section className="sub-creator-media-panel"><div className="sub-creator-section-heading"><div><span className="sub-creator-kicker">EXCLUSIVE CONTENT</span><h2>Photos & videos</h2><p>Upload content for subscribers to view.</p></div><button className="sub-creator-upload" onClick={() => mediaInputRef.current?.click()}><ImagePlus size={17}/> Upload photos / videos</button><input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={uploadMedia}/></div>{mediaNotice && <p className="sub-creator-media-notice">{mediaNotice}</p>}{media.length ? <div className="sub-creator-media-grid">{media.map(item => <article key={item.id}>{item.type === "video" ? <video src={item.data} controls playsInline/> : <img src={item.data} alt={item.name || "Creator upload"}/>}<div><span>{item.type === "video" ? <Video size={13}/> : <ImagePlus size={13}/>} {item.name || item.type}</span><button onClick={() => deleteMedia(item.id)} aria-label="Delete upload"><Trash2 size={15}/></button></div></article>)}</div> : <div className="sub-creator-media-empty"><ImagePlus size={25}/><strong>No uploads yet</strong><span>Your photos and videos will appear here after you upload them.</span></div>}</section>
      <p className="sub-creator-note">Your signup bonus and pay-per-call earnings stay in the separate Call Creator dashboard. This page is for subscription streams and subscriber chat.</p></div>
      <aside className="sub-creator-chat"><div className="sub-creator-chat-head"><div><span>SUBSCRIBER ROOM</span><h2>Live chat</h2></div><b>{isLive ? "● LIVE" : "OFFLINE"}</b></div><div className="sub-creator-chat-list">{messages.length ? messages.map(item => <div className="sub-creator-message" key={item.id}><strong>{item.name}</strong><p>{item.text}</p></div>) : <div className="sub-creator-chat-empty">Subscriber messages will appear here when you go live.</div>}</div><form onSubmit={sendMessage} className="sub-creator-chat-form"><input value={message} onChange={e => setMessage(e.target.value)} placeholder={isLive ? "Reply to subscribers…" : "Go live to chat"} disabled={!isLive}/><button disabled={!isLive || !message.trim()}>Send</button></form></aside></section>
  </main>;
}
