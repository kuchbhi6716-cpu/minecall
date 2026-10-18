

import React, { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Coins,
  LogOut,
  Phone,
  Radio,
  ShieldCheck,
  Video,
  VideoOff,
  PhoneOff,
  Check,
  X,
  RefreshCw,
  Wallet,
} from "lucide-react";
import "./CreatorDashboard.css";

const SESSION_KEY = "onlystream-test-session-v1";
const LIVE_KEY = "onlystream-test-live-v1";
const API_BASE = "";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.floor(number).toLocaleString("en-IN")
    : "0";
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed.");
  }

  return data;
}

export default function CreatorDashboard() {
  const videoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peerRef = useRef(null);

  // Buffer signals that arrive before the peer or remote description exists.
  const pendingSignalsRef = useRef([]);
  const pendingCandidatesRef = useRef([]);
  const processingSignalsRef = useRef(false);

  const requestRef = useRef(null);
  const isLiveRef = useRef(false);
  const acceptedRef = useRef(false);
  const connectedRef = useRef(false);
  const billingStartedRef = useRef(false);
  const mountedRef = useRef(false);

  const [username, setUsername] = useState("Creator");
  const [isLive, setIsLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [incomingCall, setIncomingCall] = useState(null);
  const [callConnected, setCallConnected] = useState(false);
  const [callerName, setCallerName] = useState("");
  const [economy, setEconomy] = useState(null);
  const [economyLoading, setEconomyLoading] = useState(true);
  const [economyError, setEconomyError] = useState("");
  const [callStartedAt, setCallStartedAt] = useState(null);
  const [callElapsed, setCallElapsed] = useState(0);
  const [isEnding, setIsEnding] = useState(false);

  const refreshEconomy = useCallback(async () => {
    let session;

    try {
      session = JSON.parse(
        localStorage.getItem(SESSION_KEY) || "null"
      );
    } catch {
      session = null;
    }

    if (!session?.username) {
      if (mountedRef.current) setEconomyLoading(false);
      return;
    }

    try {
      setEconomyError("");

      const response = await fetch(
        `${API_BASE}/api/economy/me?username=${encodeURIComponent(session.username)}`,
        { headers: { Accept: "application/json" } }
      );

      const data = await readJson(response);

      if (mountedRef.current) {
        setEconomy(data);
      }
    } catch (error) {
      if (mountedRef.current) {
        setEconomyError(
          error.message || "Could not load your test earnings."
        );
      }
    } finally {
      if (mountedRef.current) {
        setEconomyLoading(false);
      }
    }
  }, []);

  const stopBilling = useCallback(() => {
    if (!billingStartedRef.current) return;

    billingStartedRef.current = false;

    socketRef.current?.emit("call-billing-stop", {
      username,
      creatorUsername: username,
    });

    refreshEconomy();
  }, [refreshEconomy, username]);

  const closePeer = useCallback(() => {
    stopBilling();

    const peer = peerRef.current;

    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onconnectionstatechange = null;
      peer.oniceconnectionstatechange = null;

      try {
        peer.close();
      } catch (error) {
        console.warn("Error closing peer:", error);
      }

      peerRef.current = null;
    }

    pendingSignalsRef.current = [];
    pendingCandidatesRef.current = [];
    processingSignalsRef.current = false;

    connectedRef.current = false;
    acceptedRef.current = false;

    setCallConnected(false);
    setCallerName("");
    setCallStartedAt(null);
    setCallElapsed(0);

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [stopBilling]);

  const stopLocalStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startBilling = useCallback(() => {
    if (billingStartedRef.current) return;

    billingStartedRef.current = true;
    setCallStartedAt(Date.now());
    setCallElapsed(0);

    socketRef.current?.emit("call-billing-start", {
      username,
      creatorUsername: username,
    });
  }, [username]);

  const createPeer = useCallback((initiator) => {
    if (peerRef.current) {
      return peerRef.current;
    }

    const socket = socketRef.current;

    if (!socket) {
      console.error("Cannot create peer: socket is unavailable.");
      return null;
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = peer;

    // Add creator camera and microphone tracks before negotiation.
    const localStream = streamRef.current;

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });
    } else {
      console.error("Creator local stream is missing.");
      setCameraError(
        "Your camera is unavailable. End Live and start it again."
      );
    }

    // Receive the caller's video/audio and attach it to the main video.
    peer.ontrack = (event) => {
      console.log("Creator received remote track:", event.track.kind);

      let remoteStream = event.streams?.[0];

      if (!remoteStream) {
        remoteStream = new MediaStream();

        const existingVideo = remoteVideoRef.current?.srcObject;

        if (existingVideo instanceof MediaStream) {
          remoteStream = existingVideo;
        }

        const alreadyAdded = remoteStream
          .getTracks()
          .some((track) => track.id === event.track.id);

        if (!alreadyAdded) {
          remoteStream.addTrack(event.track);
        }
      }

      const remoteVideo = remoteVideoRef.current;

      if (remoteVideo && remoteVideo.srcObject !== remoteStream) {
        remoteVideo.srcObject = remoteStream;
      }

      if (remoteVideo) {
        remoteVideo.play().catch((error) => {
          console.warn("Remote video autoplay needs interaction:", error);
        });
      }
    };

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;

      socketRef.current?.emit("signal", {
        type: "candidate",
        candidate: event.candidate,
      });
    };

    peer.onconnectionstatechange = () => {
      console.log("Creator WebRTC connection:", peer.connectionState);

      if (peer.connectionState === "connected") {
        connectedRef.current = true;
        setCallConnected(true);
        setCameraError("");
        startBilling();
      } else if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      ) {
        connectedRef.current = false;
        setCallConnected(false);
        stopBilling();

        if (peer.connectionState === "failed") {
          setCameraError(
            "Video connection failed. Please end the call and try again."
          );
        }
      } else if (peer.connectionState === "disconnected") {
        // A brief network interruption may recover, so do not close the peer.
        console.warn("Creator connection temporarily disconnected.");
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log("Creator ICE state:", peer.iceConnectionState);
    };

    // Only the server-designated initiator should create an offer.
    if (initiator) {
      peer.createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(() => {
          socketRef.current?.emit("signal", {
            type: "offer",
            offer: peer.localDescription,
          });

          console.log("Creator offer sent.");
        })
        .catch((error) => {
          console.error("Creator offer error:", error);
          setCameraError("Could not start the video call. Please retry.");
        });
    }

    return peer;
  }, [startBilling, stopBilling]);

  const processSignal = useCallback(async (data) => {
    const peer = peerRef.current;

    if (!peer || !data) return;

    if (data.type === "candidate" && data.candidate) {
      if (!peer.remoteDescription) {
        pendingCandidatesRef.current.push(data.candidate);
        return;
      }

      await peer.addIceCandidate(
        new RTCIceCandidate(data.candidate)
      );

      return;
    }

    if (data.type === "offer" && data.offer) {
      console.log("Creator processing offer.");

      await peer.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      );

      // Apply ICE candidates received before the offer.
      const candidates = pendingCandidatesRef.current.splice(0);

      for (const candidate of candidates) {
        await peer.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socketRef.current?.emit("signal", {
        type: "answer",
        answer: peer.localDescription,
      });

      console.log("Creator answer sent.");
      return;
    }

    if (data.type === "answer" && data.answer) {
      console.log("Creator processing answer.");

      await peer.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );

      const candidates = pendingCandidatesRef.current.splice(0);

      for (const candidate of candidates) {
        await peer.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
    }
  }, []);

  const drainSignals = useCallback(async () => {
    if (processingSignalsRef.current) return;
    if (!peerRef.current) return;

    processingSignalsRef.current = true;

    try {
      while (
        pendingSignalsRef.current.length > 0 &&
        peerRef.current
      ) {
        const data = pendingSignalsRef.current.shift();

        try {
          await processSignal(data);
        } catch (error) {
          console.error(
            `Creator failed to process ${data?.type || "unknown"} signal:`,
            error
          );
        }
      }
    } finally {
      processingSignalsRef.current = false;

      // A new signal may have arrived while the previous one was processing.
      if (
        pendingSignalsRef.current.length > 0 &&
        peerRef.current
      ) {
        queueMicrotask(() => {
          drainSignals();
        });
      }
    }
  }, [processSignal]);

  const handleSignal = useCallback((data) => {
    if (!data) return;

    console.log("Creator received signal:", data.type);

    // Do not discard an offer/candidate just because matched has not arrived yet.
    pendingSignalsRef.current.push(data);

    if (peerRef.current) {
      drainSignals();
    }
  }, [drainSignals]);

  useEffect(() => {
    mountedRef.current = true;

    let session;

    try {
      session = JSON.parse(
        localStorage.getItem(SESSION_KEY) || "null"
      );

      if (!session || session.role !== "creator") {
        window.location.replace("/login");
        return undefined;
      }

      setUsername(session.username || "Creator");

      const oldLive = JSON.parse(
        localStorage.getItem(LIVE_KEY) || "null"
      );

      if (
        oldLive?.username === session.username &&
        oldLive.isLive
      ) {
        localStorage.removeItem(LIVE_KEY);
      }
    } catch {
      window.location.replace("/login");
      return undefined;
    }

    refreshEconomy();

    const socket = io({
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Creator socket connected:", socket.id);
      socket.emit("get-live-creators");
    });

    socket.on("connect_error", (error) => {
      console.error("Creator socket connection error:", error);
      setCameraError("Server connection failed. Please refresh and retry.");
    });

    socket.on("incoming-creator-call", (request) => {
      if (!isLiveRef.current || acceptedRef.current) {
        socket.emit("creator-call-reject", {
          requestId: request?.requestId,
        });

        return;
      }

      requestRef.current = request;
      setIncomingCall(request);
    });

    const clearIncomingRequest = () => {
      requestRef.current = null;
      setIncomingCall(null);
    };

    socket.on("creator-call-request-cancelled", clearIncomingRequest);
    socket.on("creator-call-cancelled", clearIncomingRequest);

    socket.on("creator-call-rejected", () => {
      clearIncomingRequest();
      setCameraError("The call request was declined or cancelled.");
    });

    socket.on("creator-call-accepted", (data) => {
      acceptedRef.current = true;
      requestRef.current = null;

      setIncomingCall(null);
      setCallerName(data?.callerName || "Caller");
      setCameraError("");

      console.log(
        "Creator call accepted. Waiting for matched/WebRTC negotiation."
      );
    });

    socket.on("matched", (data) => {
      if (!isLiveRef.current || !acceptedRef.current) {
        console.warn("Ignoring matched event: creator is not ready.");
        return;
      }

      console.log("Creator matched event:", data);

      setCallerName((current) => current || "Caller");

      createPeer(Boolean(data?.initiator));

      // Now process any offer/candidates received before matched.
      drainSignals();
    });

    socket.on("signal", handleSignal);

    socket.on("partner-left", () => {
      console.log("Creator received partner-left.");

      closePeer();
      clearIncomingRequest();
      setCameraError("The caller ended the call.");
      refreshEconomy();
    });

    socket.on("call-billing-update", (data) => {
      if (data) {
        setEconomy((current) => ({
          ...(current || {}),
          ...data,
        }));
      }
    });

    socket.on("disconnect", () => {
      console.warn("Creator socket disconnected.");

      closePeer();
      clearIncomingRequest();
      setCameraError("Connection lost. Reconnect and try again.");
    });

    socket.on("creator-live-replaced", () => {
      isLiveRef.current = false;
      setIsLive(false);

      stopLocalStream();
      closePeer();

      localStorage.removeItem(LIVE_KEY);
      setCameraError("Your live session was replaced by another session.");
    });

    return () => {
      mountedRef.current = false;
      isLiveRef.current = false;

      socket.removeAllListeners();
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      closePeer();
      stopLocalStream();
    };
  }, [
    closePeer,
    createPeer,
    drainSignals,
    handleSignal,
    refreshEconomy,
    stopLocalStream,
  ]);

  useEffect(() => {
    if (!callConnected || !callStartedAt) return undefined;

    const updateElapsed = () => {
      setCallElapsed(
        Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))
      );
    };

    updateElapsed();

    const interval = window.setInterval(updateElapsed, 1000);

    return () => window.clearInterval(interval);
  }, [callConnected, callStartedAt]);

  async function goLive() {
    setCameraError("");
    setBusy(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is unavailable. Open the website using HTTPS."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const session = JSON.parse(
        localStorage.getItem(SESSION_KEY) || "null"
      );

      const creatorUsername = session?.username || username;
      const socket = socketRef.current;

      if (!socket?.connected) {
        throw new Error("Server is not connected. Please retry in a moment.");
      }

      socket.emit(
        "creator-go-live",
        { username: creatorUsername },
        (response) => {
          if (response?.ok === false) {
            isLiveRef.current = false;
            setIsLive(false);
            stopLocalStream();

            setCameraError(
              response.error ||
              response.message ||
              "Could not publish your live status."
            );

            return;
          }

          isLiveRef.current = true;
          setIsLive(true);

          localStorage.setItem(
            LIVE_KEY,
            JSON.stringify({
              username: creatorUsername,
              isLive: true,
              startedAt: new Date().toISOString(),
            })
          );

          console.log("Creator is live:", creatorUsername);
        }
      );

      window.setTimeout(() => {
        if (mountedRef.current && !isLiveRef.current && streamRef.current) {
          setCameraError((current) =>
            current ||
            "The server has not confirmed Go Live. Check the server logs and retry."
          );
        }
      }, 8000);
    } catch (error) {
      stopLocalStream();

      setCameraError(
        error?.name === "NotAllowedError"
          ? "Camera or microphone permission was denied. Allow access in your browser settings."
          : error?.message ||
            "Could not start your camera. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function acceptCall() {
    const request = requestRef.current;
    const socket = socketRef.current;

    if (!request?.requestId || !socket) return;

    setCameraError("");
    acceptedRef.current = true;
    setCallerName(request.callerName || "Caller");
    setIncomingCall(null);

    socket.emit(
      "creator-call-accept",
      { requestId: request.requestId },
      (response) => {
        if (response?.ok === false) {
          closePeer();
          requestRef.current = null;

          setCameraError(
            response.error ||
            response.message ||
            "This call request is no longer available."
          );
        }
      }
    );

    requestRef.current = null;
  }

  function rejectCall() {
    const request = requestRef.current;

    if (request?.requestId) {
      socketRef.current?.emit("creator-call-reject", {
        requestId: request.requestId,
      });
    }

    requestRef.current = null;
    setIncomingCall(null);
  }

  function endCall() {
    socketRef.current?.emit("stop-chat");

    closePeer();
    setIncomingCall(null);
    requestRef.current = null;
    setCameraError("");

    refreshEconomy();
  }

  function endLive() {
    if (isEnding) return;

    setIsEnding(true);

    if (requestRef.current?.requestId) {
      socketRef.current?.emit("creator-call-reject", {
        requestId: requestRef.current.requestId,
      });
    }

    stopBilling();

    socketRef.current?.emit("creator-end-live", { username });

    closePeer();
    setIncomingCall(null);
    requestRef.current = null;

    isLiveRef.current = false;
    stopLocalStream();

    localStorage.removeItem(LIVE_KEY);
    setIsLive(false);
    setCameraError("");
    setIsEnding(false);

    refreshEconomy();
  }

  function logout() {
    stopBilling();

    socketRef.current?.emit("creator-end-live", { username });

    isLiveRef.current = false;

    closePeer();
    stopLocalStream();

    localStorage.removeItem(LIVE_KEY);
    localStorage.removeItem(SESSION_KEY);

    window.location.href = "/";
  }

  const creatorCoins =
    economy?.creatorCoins ??
    economy?.coins ??
    economy?.balance ??
    economy?.wallet?.coins ??
    0;

  const creatorRevenue =
    economy?.creatorRevenue ??
    economy?.revenue ??
    economy?.earnings ??
    economy?.wallet?.revenue ??
    0;

  const elapsedLabel =
    `${String(Math.floor(callElapsed / 60)).padStart(2, "0")}:` +
    `${String(callElapsed % 60).padStart(2, "0")}`;

  return (
    <main className="creator-dashboard">
      <header className="creator-header">
        <a className="creator-brand" href="/">
          OnlyStream<span>.</span>
        </a>

        <button className="creator-logout" onClick={logout}>
          <LogOut size={17} />
          <span>Log out</span>
        </button>
      </header>

      <div className="creator-welcome">
        <a className="creator-back" href="/">
          <ArrowLeft size={16} />
          Home
        </a>

        <p className="creator-eyebrow">CREATOR STUDIO</p>
        <h1>Welcome, {username}</h1>
        <p className="creator-subtitle">
          Go live, accept incoming calls, and manage your test earnings.
        </p>
      </div>

      <section className="creator-dashboard-grid">
        <div className="creator-camera-panel">
          <div className="creator-panel-heading">
            <div>
              <h2>{callConnected ? "You're on a call" : "Your camera"}</h2>
              <p>
                {callConnected
                  ? `Connected with ${callerName || "caller"} · ${elapsedLabel}`
                  : "Go live to become available for incoming calls."}
              </p>
            </div>

            <span className={isLive ? "creator-status live" : "creator-status"}>
              <span className="creator-status-dot" />
              {isLive ? "LIVE" : "OFFLINE"}
            </span>
          </div>

          <div className="creator-video-stage">
            <video
              ref={remoteVideoRef}
              className="creator-remote-video"
              autoPlay
              playsInline
            />

            <video
              ref={videoRef}
              className={
                callConnected
                  ? "creator-preview-video creator-preview-small"
                  : "creator-preview-video"
              }
              autoPlay
              muted
              playsInline
            />

            {!isLive && (
              <div className="creator-camera-placeholder">
                <div className="creator-camera-icon">
                  <CameraOff size={32} />
                </div>
                <h3>Your camera preview</h3>
                <p>Go live to turn on your camera and microphone.</p>
              </div>
            )}

            {isLive && (
              <div className="creator-live-label">
                <span />
                LIVE NOW
              </div>
            )}

            {callConnected && (
              <div className="creator-call-label">
                <Phone size={14} />
                Connected
              </div>
            )}
          </div>

          {cameraError && (
            <p className="creator-error" role="alert">
              {cameraError}
            </p>
          )}

          {incomingCall && (
            <div className="creator-incoming-call">
              <div className="creator-incoming-icon">
                <Phone size={20} />
              </div>

              <div className="creator-incoming-details">
                <strong>Incoming call</strong>
                <span>
                  {incomingCall.callerName || "A user"} wants to call you.
                </span>
              </div>

              <div className="creator-incoming-actions">
                <button
                  className="creator-accept-call"
                  onClick={acceptCall}
                  aria-label="Accept call"
                >
                  <Check size={18} />
                  Accept
                </button>

                <button
                  className="creator-reject-call"
                  onClick={rejectCall}
                  aria-label="Reject call"
                >
                  <X size={18} />
                  Reject
                </button>
              </div>
            </div>
          )}

          <div className="creator-camera-actions">
            {!isLive ? (
              <button
                className="creator-go-live"
                onClick={goLive}
                disabled={busy}
              >
                <Radio size={19} />
                {busy ? "Starting camera..." : "Go Live"}
              </button>
            ) : callConnected ? (
              <button className="creator-end-live" onClick={endCall}>
                <PhoneOff size={19} />
                End Call
              </button>
            ) : (
              <button
                className="creator-end-live"
                onClick={endLive}
                disabled={isEnding}
              >
                <VideoOff size={19} />
                {isEnding ? "Ending..." : "End Live"}
              </button>
            )}
          </div>

          <p className="creator-camera-note">
            <ShieldCheck size={15} />
            Your browser asks permission before camera and microphone access.
          </p>
        </div>

        <aside className="creator-stats-column">
          <div className="creator-stat-card">
            <div className="creator-stat-icon">
              <Coins size={22} />
            </div>
            <p className="creator-stat-label">Creator coin balance</p>
            <div className="creator-stat-value">
              {economyLoading ? "…" : formatNumber(creatorCoins)}
            </div>
            <p className="creator-stat-footnote">
              Demo balance · refreshes from the server
            </p>
          </div>

          <div className="creator-stat-card">
            <div className="creator-stat-icon">
              <Wallet size={22} />
            </div>
            <p className="creator-stat-label">Estimated creator revenue</p>
            <div className="creator-stat-value">
              {economyLoading ? "…" : `₹${formatNumber(creatorRevenue)}`}
            </div>
            <p className="creator-stat-footnote">
              Test estimate only · not withdrawable money
            </p>

            <button
              type="button"
              className="creator-refresh-button"
              onClick={refreshEconomy}
              disabled={economyLoading}
            >
              <RefreshCw size={14} />
              {economyLoading ? "Refreshing…" : "Refresh earnings"}
            </button>

            {economyError && (
              <p className="creator-error" role="alert">
                {economyError}
              </p>
            )}
          </div>

          <div className="creator-info-card">
            <div className="creator-info-icon">
              <Video size={21} />
            </div>
            <h3>How it works</h3>
            <ul>
              <li>Go Live to publish your creator status.</li>
              <li>Accept a call to connect video and audio.</li>
              <li>End Call to stop the current call.</li>
              <li>End Live to stop your camera and microphone.</li>
            </ul>
          </div>

          <div className="creator-info-card creator-test-card">
            <div className="creator-info-icon">
              <Camera size={21} />
            </div>
            <h3>Testing version</h3>
            <p>
              Coins and revenue shown here are demo values. This is not a
              payment processor, and the displayed amount is not withdrawable.
              Production use needs secure server-side authentication, a
              persistent database, and a verified payment provider.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
