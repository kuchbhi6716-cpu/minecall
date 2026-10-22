import React, { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ArrowLeft, Camera, CameraOff, Gift, LogOut, Phone,
  Radio, ShieldCheck, Video, VideoOff, PhoneOff, Check, X,
  RefreshCw, Wallet, Mic, MicOff, RotateCw, Send, TrendingUp, CalendarDays, ArrowUpRight
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

export default function CreatorDashboard({ exclusiveMode = false } = {}) {
  const videoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const thumbnailIntervalRef = useRef(null);
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const pendingSignalsRef = useRef([]);
  const pendingCandidatesRef = useRef([]);
  const processingSignalsRef = useRef(false);
  const requestRef = useRef(null);
  const isLiveRef = useRef(false);
  const acceptedRef = useRef(false);
  const billingStartedRef = useRef(false);
  const mountedRef = useRef(false);
  const cameraFacingRef = useRef("user");
  const switchCameraRef = useRef(false);
  const acceptingRequestRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingRef = useRef(false);

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
  const [ledger, setLedger] = useState([]);
  const [showEarnings, setShowEarnings] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState("week");
  const [callStartedAt, setCallStartedAt] = useState(null);
  const [callElapsed, setCallElapsed] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatMessage, setChatMessage] = useState("");
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [cameraSwitching, setCameraSwitching] = useState(false);

  const refreshEconomy = useCallback(async () => {
    let session;
    try {
      session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      session = null;
    }

    if (!session?.username) {
      if (mountedRef.current) setEconomyLoading(false);
      return;
    }

    try {
      setEconomyLoading(true);
      setEconomyError("");

      const endpoint = exclusiveMode
        ? `${API_BASE}/api/exclusive-earnings?username=${encodeURIComponent(session.username)}`
        : `${API_BASE}/api/economy/me?username=${encodeURIComponent(session.username)}`;
      const response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await readJson(response);

      if (mountedRef.current) {
        if (exclusiveMode) {
          const earnings = data.earnings || {};
          setEconomy({
            testRevenueInr: Number(earnings.total || 0),
            creatorRevenue: Number(earnings.total || 0),
            testBonusInr: 0,
            coins: 0,
          });
          setLedger((Array.isArray(data.rows) ? data.rows : []).map((row) => ({
            id: row.id || `${row.createdAt}-${row.buyerUsername}`,
            transactionId: row.id,
            username: session.username,
            creatorUsername: session.username,
            buyerUsername: row.buyerUsername || "",
            type: "exclusive-access-sale",
            creatorShareInr: Number(row.amount || 0),
            grossAmount: Number(row.grossAmount || row.amount || 0),
            at: row.createdAt || new Date().toISOString(),
          })));
        } else {
          setEconomy(data.account ?? data.economy ?? data);
          setLedger(Array.isArray(data.recentLedger) ? data.recentLedger : []);
        }
      }
    } catch (error) {
      if (mountedRef.current) setEconomyError(error.message || "Could not load your test earnings.");
    } finally {
      if (mountedRef.current) setEconomyLoading(false);
    }
  }, [exclusiveMode]);

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

    if (peerRef.current) {
      const peer = peerRef.current;
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
    acceptedRef.current = false;
    acceptingRequestRef.current = null;

    setCallConnected(false);
    setCallerName("");
    setCallStartedAt(null);
    setCallElapsed(0);

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [stopBilling]);

  const stopLocalStream = useCallback(() => {
    if (thumbnailIntervalRef.current) {
      window.clearInterval(thumbnailIntervalRef.current);
      thumbnailIntervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;

    setMicMuted(false);
    setCameraOff(false);
    setFacingMode("user");
    cameraFacingRef.current = "user";
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
    if (peerRef.current) return peerRef.current;

    const socket = socketRef.current;
    if (!socket) return null;

    const peer = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = peer;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, streamRef.current);
      });
    } else {
      setCameraError("Your camera is unavailable. Start Live again.");
    }

    peer.ontrack = (event) => {
      const remoteVideo = remoteVideoRef.current;
      if (!remoteVideo) return;

      let remoteStream = event.streams?.[0];

      if (!remoteStream) {
        remoteStream =
          remoteVideo.srcObject instanceof MediaStream
            ? remoteVideo.srcObject
            : new MediaStream();

        if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          remoteStream.addTrack(event.track);
        }
      }

      if (remoteVideo.srcObject !== remoteStream) {
        remoteVideo.srcObject = remoteStream;
      }

      remoteVideo.play().catch(() => {});
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("signal", {
          type: "candidate",
          candidate: event.candidate,
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setCallConnected(true);
        setCameraError("");
        startBilling();
      } else if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      ) {
        setCallConnected(false);
        stopBilling();

        if (peer.connectionState === "failed") {
          setCameraError("Video connection failed. End the call and retry.");
        }
      }
    };

    if (initiator) {
      peer.createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(() => {
          socketRef.current?.emit("signal", {
            type: "offer",
            offer: peer.localDescription,
          });
        })
        .catch((error) => {
          console.error("Offer error:", error);
          setCameraError("Could not start the video call.");
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

      await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      return;
    }

    if (data.type === "offer" && data.offer) {
      await peer.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      );

      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socketRef.current?.emit("signal", {
        type: "answer",
        answer: peer.localDescription,
      });
      return;
    }

    if (data.type === "answer" && data.answer) {
      await peer.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );

      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
  }, []);

  const drainSignals = useCallback(async () => {
    if (processingSignalsRef.current || !peerRef.current) return;

    processingSignalsRef.current = true;

    try {
      while (pendingSignalsRef.current.length && peerRef.current) {
        const data = pendingSignalsRef.current.shift();

        try {
          await processSignal(data);
        } catch (error) {
          console.error("Signal processing failed:", error);
        }
      }
    } finally {
      processingSignalsRef.current = false;

      if (pendingSignalsRef.current.length && peerRef.current) {
        queueMicrotask(() => drainSignals());
      }
    }
  }, [processSignal]);

  const handleSignal = useCallback((data) => {
    if (!data) return;

    pendingSignalsRef.current.push(data);
    if (peerRef.current) drainSignals();
  }, [drainSignals]);

  useEffect(() => {
    mountedRef.current = true;

    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");

      if (!session || session.role !== "creator") {
        window.location.replace(`/login?next=${encodeURIComponent(exclusiveMode ? "/subscription-creator" : "/creator")}`);
        return undefined;
      }

      if (exclusiveMode && session.creatorPlan !== "subscription") {
        window.location.replace("/creator");
        return undefined;
      }

      if (!exclusiveMode && session.creatorPlan === "subscription") {
        window.location.replace("/subscription-creator");
        return undefined;
      }

      setUsername(session.username || "Creator");

      const oldLive = JSON.parse(localStorage.getItem(LIVE_KEY) || "null");
      if (oldLive?.username === session.username && oldLive.isLive) {
        localStorage.removeItem(LIVE_KEY);
      }
    } catch {
      window.location.replace("/login");
      return undefined;
    }

    refreshEconomy();

    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("get-live-creators");
      if (exclusiveMode) refreshEconomy();
    });

    socket.on("subscription-earnings-updated", (data) => {
      // This event is emitted only to the creator socket for the matching sale.
      // Do not compare against the initial username state captured by this effect.
      if (exclusiveMode) refreshEconomy();
    });

    socket.on("connect_error", () => {
      setCameraError("Server connection failed. Please refresh and retry.");
    });

    const clearIncomingRequest = () => {
      requestRef.current = null;
      acceptingRequestRef.current = null;
      setIncomingCall(null);
    };

    // Automatically accept calls as soon as an incoming request arrives.
    socket.on("incoming-creator-call", (request) => {
      if (!request?.requestId) return;

      if (
        !isLiveRef.current ||
        acceptedRef.current ||
        acceptingRequestRef.current
      ) {
        socket.emit("creator-call-reject", {
          requestId: request.requestId,
        });
        return;
      }

      requestRef.current = request;
      acceptingRequestRef.current = request.requestId;

      // Automatically accept; no manual button press is required.
      acceptCall();
    });

    socket.on("creator-call-request-cancelled", clearIncomingRequest);
    socket.on("creator-call-cancelled", clearIncomingRequest);

    socket.on("creator-call-rejected", () => {
      clearIncomingRequest();
      setCameraError("The call request was declined or cancelled.");
    });

    socket.on("creator-call-accepted", (data) => {
      acceptedRef.current = true;
      requestRef.current = null;
      acceptingRequestRef.current = null;
      setIncomingCall(null);
      setCallerName(data?.callerName || "Caller");
      setCameraError("");
    });

    socket.on("matched", (data) => {
      if (!isLiveRef.current || !acceptedRef.current) return;

      setCallerName((current) => current || "Caller");
      createPeer(Boolean(data?.initiator));
      drainSignals();
    });

    socket.on("signal", handleSignal);

    socket.on("chat-message", (text) => {
      if (typeof text !== "string") return;
      setChatMessages((old) => [
        ...old,
        {
          id: `${Date.now()}-${Math.random()}`,
          text: text.slice(0, 1000),
          own: false,
        },
      ]);
    });

    socket.on("typing", (value) => {
      setPartnerTyping(Boolean(value));
    });

    socket.on("partner-left", () => {
      closePeer();
      clearIncomingRequest();
      setPartnerTyping(false);
      setChatMessage("");
      setChatMessages([]);
      setCameraError("The caller ended the call.");
      refreshEconomy();
    });

    socket.on("call-billing-update", (data) => {
      if (data) setEconomy((current) => ({ ...(current || {}), ...data }));
    });

    socket.on("disconnect", () => {
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
      window.clearTimeout(typingTimeoutRef.current);
      socket.removeAllListeners();
      socket.disconnect();

      if (socketRef.current === socket) socketRef.current = null;

      closePeer();
      stopLocalStream();
    };
  }, [
    closePeer, createPeer, drainSignals, handleSignal,
    refreshEconomy, stopLocalStream
  ]);

  useEffect(() => {
    if (!callConnected || !callStartedAt) return undefined;

    const updateElapsed = () => {
      setCallElapsed(Math.max(
        0,
        Math.floor((Date.now() - callStartedAt) / 1000)
      ));
    };

    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [callConnected, callStartedAt]);

  useEffect(() => {
    const area = chatMessagesRef.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [chatMessages, partnerTyping]);

  function handleChatChange(event) {
    const value = event.target.value;
    setChatMessage(value);
    if (!callConnected) return;

    if (!typingRef.current) {
      typingRef.current = true;
      socketRef.current?.emit("typing", true);
    }

    window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      typingRef.current = false;
      socketRef.current?.emit("typing", false);
    }, 900);
  }

  function sendChatMessage(event) {
    event.preventDefault();
    const text = chatMessage.trim();
    if (!text || !callConnected) return;

    window.clearTimeout(typingTimeoutRef.current);
    typingRef.current = false;
    socketRef.current?.emit("typing", false);
    socketRef.current?.emit("chat-message", text);
    setChatMessages((old) => [
      ...old,
      { id: `${Date.now()}-${Math.random()}`, text, own: true },
    ]);
    setChatMessage("");
  }

  function publishLiveThumbnail() {
    const video = videoRef.current;
    const socket = socketRef.current;
    if (!video || !socket?.connected || !isLiveRef.current || video.videoWidth < 2 || video.videoHeight < 2) return;

    try {
      const canvas = document.createElement("canvas");
      // Small, compressed live snapshots keep the homepage fast on mobile data.
      canvas.width = 480;
      canvas.height = Math.max(1, Math.round(480 * video.videoHeight / video.videoWidth));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnail = canvas.toDataURL("image/jpeg", 0.62);
      socket.emit("creator-live-thumbnail", { thumbnail });
    } catch (error) {
      // Snapshot capture can fail temporarily while the camera is starting.
    }
  }

  async function goLive() {
    setCameraError("");
    setBusy(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires HTTPS.");
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
      cameraFacingRef.current = "user";
      setFacingMode("user");
      setMicMuted(false);
      setCameraOff(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      const creatorUsername = session?.username || username;
      const socket = socketRef.current;

      if (!socket?.connected) {
        throw new Error("Server is not connected. Please retry.");
      }

      socket.emit("creator-go-live", {
        username: creatorUsername,
        creatorPlan: exclusiveMode ? "subscription" : "calls",
        subscriptionPrice: exclusiveMode ? Math.max(1, Number(session?.subscriptionPrice) || 499) : 0,
      }, (response) => {
        if (response?.ok === false) {
          isLiveRef.current = false;
          setIsLive(false);
          stopLocalStream();

          setCameraError(
            response.error || response.message || "Could not publish live status."
          );
          return;
        }

        isLiveRef.current = true;
        setIsLive(true);

        if (thumbnailIntervalRef.current) window.clearInterval(thumbnailIntervalRef.current);
        window.setTimeout(publishLiveThumbnail, 900);
        thumbnailIntervalRef.current = window.setInterval(publishLiveThumbnail, 5000);

        localStorage.setItem(LIVE_KEY, JSON.stringify({
          username: creatorUsername,
          isLive: true,
          startedAt: new Date().toISOString(),
        }));
      });

      window.setTimeout(() => {
        if (mountedRef.current && !isLiveRef.current && streamRef.current) {
          setCameraError((current) => current ||
            "Server has not confirmed Go Live. Check server logs and retry.");
        }
      }, 8000);
    } catch (error) {
      stopLocalStream();
      setCameraError(
        error?.name === "NotAllowedError"
          ? "Camera or microphone permission denied. Allow access in browser settings."
          : error?.message || "Could not start your camera."
      );
    } finally {
      setBusy(false);
    }
  }

  function acceptCall() {
    const request = requestRef.current;
    const socket = socketRef.current;

    if (!request?.requestId || !socket) {
      acceptingRequestRef.current = null;
      return;
    }

    setCameraError("");
    acceptedRef.current = true;
    setCallerName(request.callerName || "Caller");
    setIncomingCall(null);

    socket.emit("creator-call-accept", { requestId: request.requestId }, (response) => {
      if (response?.ok === false) {
        acceptedRef.current = false;
        requestRef.current = null;
        acceptingRequestRef.current = null;
        setCameraError(response.error || response.message ||
          "This call request is no longer available.");
      }
    });

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
    acceptingRequestRef.current = null;
    setIncomingCall(null);
  }

  function toggleMic() {
    const tracks = streamRef.current?.getAudioTracks() || [];
    if (!tracks.length) return;

    const nextMuted = !micMuted;
    tracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  }

  function toggleCamera() {
    const tracks = streamRef.current?.getVideoTracks() || [];
    if (!tracks.length) return;

    const nextOff = !cameraOff;
    tracks.forEach((track) => {
      track.enabled = !nextOff;
    });
    setCameraOff(nextOff);
  }

  async function switchCamera() {
    if (!streamRef.current || cameraSwitching) return;

    const nextFacing = facingMode === "user" ? "environment" : "user";
    setCameraSwitching(true);
    setCameraError("");

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) throw new Error("Could not access the selected camera.");

      newTrack.enabled = !cameraOff;

      const peer = peerRef.current;
      if (peer) {
        const sender = peer.getSenders().find(
          (item) => item.track?.kind === "video"
        );

        if (sender) await sender.replaceTrack(newTrack);
        else peer.addTrack(newTrack, streamRef.current);
      }


      const oldTrack = streamRef.current.getVideoTracks()[0];
      if (oldTrack) {
        streamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
      }

      streamRef.current.addTrack(newTrack);
      cameraFacingRef.current = nextFacing;
      setFacingMode(nextFacing);

      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play().catch(() => {});
      }

      newStream.getTracks().forEach((track) => {
        if (track !== newTrack) track.stop();
      });
    } catch (error) {
      setCameraError(
        error?.message || "Could not switch camera. Your device may not support it."
      );
    } finally {
      setCameraSwitching(false);
    }
  }

  function endCall() {
    socketRef.current?.emit("typing", false);
    socketRef.current?.emit("stop-chat");
    window.clearTimeout(typingTimeoutRef.current);
    typingRef.current = false;
    closePeer();
    setIncomingCall(null);
    requestRef.current = null;
    acceptingRequestRef.current = null;
    setPartnerTyping(false);
    setChatMessage("");
    setChatMessages([]);
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

    socketRef.current?.emit("typing", false);
    socketRef.current?.emit("creator-end-live", { username });
    window.clearTimeout(typingTimeoutRef.current);
    typingRef.current = false;
    setPartnerTyping(false);
    setChatMessage("");
    setChatMessages([]);
    closePeer();
    setIncomingCall(null);
    requestRef.current = null;
    acceptingRequestRef.current = null;

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
    economy?.creatorCoins ?? economy?.coins ?? economy?.balance ??
    economy?.wallet?.coins ?? 0;

  const creatorRevenue =
    economy?.testRevenueInr ?? economy?.creatorRevenue ?? economy?.revenue ??
    economy?.earnings ?? economy?.wallet?.revenue ?? 0;

  const signupBonus = Number(economy?.testBonusInr ?? 0);
  const earningRows = ledger
    .filter((row) => row.username === username || row.creatorUsername === username)
    .map((row) => {
      const isBonus = row.type === "creator-test-signup-bonus";
      const isExclusiveSale = row.type === "exclusive-access-sale";
      const amount = isBonus ? Number(row.amountInr || 0) : Number(row.creatorShareInr || 0);
      return { ...row, isBonus, isExclusiveSale, earningAmount: amount, date: new Date(row.at || Date.now()) };
    })
    .filter((row) => row.earningAmount > 0)
    .sort((a, b) => b.date - a.date);
  const nowForEarnings = new Date();
  const periodDays = earningsPeriod === "today" ? 1 : earningsPeriod === "week" ? 7 : 30;
  const periodStart = new Date(nowForEarnings);
  periodStart.setHours(0, 0, 0, 0);
  periodStart.setDate(periodStart.getDate() - (periodDays - 1));
  const periodRows = earningRows.filter((row) => row.date >= periodStart && row.date <= nowForEarnings);
  const periodCallRows = periodRows.filter((row) => !row.isBonus);
  const periodCallTotal = periodCallRows.reduce((sum, row) => sum + row.earningAmount, 0);
  const totalEarned = signupBonus + Number(creatorRevenue || 0);
  const graphBuckets = Array.from({ length: earningsPeriod === "today" ? 6 : earningsPeriod === "week" ? 7 : 30 }, (_, index) => {
    const date = new Date(periodStart);
    if (earningsPeriod === "today") date.setHours(date.getHours() + index * 4);
    else date.setDate(date.getDate() + index);
    const end = new Date(date);
    if (earningsPeriod === "today") end.setHours(end.getHours() + 4);
    else end.setDate(end.getDate() + 1);
    const amount = periodCallRows.filter((row) => row.date >= date && row.date < end).reduce((sum, row) => sum + row.earningAmount, 0);
    return { label: earningsPeriod === "today" ? `${String(date.getHours()).padStart(2, "0")}:00` : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), amount };
  });
  const graphMax = Math.max(1, ...graphBuckets.map((item) => item.amount));

  const elapsedLabel =
    `${String(Math.floor(callElapsed / 60)).padStart(2, "0")}:` +
    `${String(callElapsed % 60).padStart(2, "0")}`;

  return (
    <main className="creator-dashboard">
      <header className="creator-header">
        <a className="creator-brand" href="/">OnlyStream<span>.</span></a>
        <button className="creator-logout" onClick={logout}>
          <LogOut size={17} /><span>Log out</span>
        </button>
      </header>

      <div className="creator-welcome">
        <a className="creator-back" href="/">
          <ArrowLeft size={16} /> Home
        </a>
        <p className="creator-eyebrow">{exclusiveMode ? "EXCLUSIVE CREATOR STUDIO" : "CREATOR STUDIO"}</p>
        <h1>Welcome, {username}</h1>
        <p className="creator-subtitle">
          {exclusiveMode
            ? "Go available for your reserved buyer, manage calls and track your 24-hour access earnings."
            : "Go live, receive automatically accepted calls, and manage your test earnings."}
        </p>
      </div>

      {showEarnings && (
        <section className="creator-earnings-page">
          <button type="button" className="creator-earnings-back" onClick={() => setShowEarnings(false)}><ArrowLeft size={17} /> Back to Creator Studio</button>
          <div className="creator-earnings-heading">
            <div><p className="creator-eyebrow">CREATOR FINANCE</p><h2>Your Earnings</h2><p>{exclusiveMode ? "Earnings from 24-hour exclusive access purchases." : "Signup bonus and earnings from every recorded call."}</p></div>
            <div className="creator-earnings-total"><span>Total earnings</span><strong>{economyLoading ? "…" : `₹${formatNumber(totalEarned)}`}</strong><small>{exclusiveMode ? "Exclusive access fees" : "Signup bonus + call earnings"}</small></div>
          </div>
          <div className="creator-earnings-summary-grid">
            {!exclusiveMode && <article className="creator-earnings-summary"><span><Gift size={17} /> Signup bonus</span><strong>₹{formatNumber(signupBonus)}</strong></article>}
            <article className="creator-earnings-summary"><span><Phone size={17} /> {exclusiveMode ? "Exclusive access earnings" : "Earnings from calls"}</span><strong>₹{formatNumber(creatorRevenue)}</strong></article>
            <article className="creator-earnings-summary"><span><CalendarDays size={17} /> Selected period</span><strong>₹{formatNumber(periodCallTotal)}</strong></article>
          </div>
          <div className="creator-earnings-panel">
            <div className="creator-earnings-panel-heading"><div><h3>Earnings overview</h3><p>{exclusiveMode ? "Exclusive access fees grouped by date." : "Call earnings grouped by date. Signup bonus is shown separately above."}</p></div>
              <div className="creator-period-tabs">
                <button className={earningsPeriod === "today" ? "active" : ""} onClick={() => setEarningsPeriod("today")}>Today</button>
                <button className={earningsPeriod === "week" ? "active" : ""} onClick={() => setEarningsPeriod("week")}>Last 7 days</button>
                <button className={earningsPeriod === "month" ? "active" : ""} onClick={() => setEarningsPeriod("month")}>Last 30 days</button>
              </div>
            </div>
            <div className={`creator-earnings-chart ${earningsPeriod === "month" ? "month-chart" : ""}`} role="img" aria-label="Call earnings graph">
              {graphBuckets.map((item, index) => <div className="creator-earnings-bar-wrap" key={`${item.label}-${index}`} title={`${item.label}: ₹${item.amount.toFixed(2)}`}><div className="creator-earnings-bar" style={{ height: `${Math.max(item.amount > 0 ? 5 : 2, (item.amount / graphMax) * 100)}%` }} /><span>{earningsPeriod === "month" && index % 5 !== 0 ? "" : item.label}</span></div>)}
            </div>
            <div className="creator-earnings-chart-foot"><span>{exclusiveMode ? "Selected period access earnings" : "Selected period call earnings"}</span><strong>₹{periodCallTotal.toFixed(2)}</strong></div>
          </div>
          <div className="creator-earnings-panel creator-earnings-history">
            <div className="creator-earnings-panel-heading"><div><h3>Earning history</h3><p>{exclusiveMode ? "Individual 24-hour access purchases." : "Signup bonus and individual call earnings."}</p></div></div>
            {earningRows.length ? earningRows.map((row) => <div className="creator-earning-row" key={row.id}><div className="creator-earning-row-icon">{row.isBonus ? <Gift size={18} /> : <Phone size={18} />}</div><div className="creator-earning-row-copy"><strong>{row.isBonus ? "Signup bonus" : row.isExclusiveSale ? "24-hour access fee" : "Earning from call"}</strong><span>{row.date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{row.callId ? ` · Call ${String(row.callId).slice(-6)}` : row.transactionId ? ` · Ref ${String(row.transactionId).slice(-6)}` : ""}</span></div><strong className="creator-earning-amount">+₹{row.earningAmount.toFixed(2)}</strong></div>) : <div className="creator-earnings-empty">{exclusiveMode ? "No access purchases have been recorded yet." : "No earning entries have been recorded yet. New call earnings will appear here."}</div>}
          </div>
          <div className="creator-withdraw-area"><div><h3>Want to withdraw?</h3><p>Withdrawals are not enabled in this testing version. No real payout can be requested yet.</p></div><button type="button" disabled title="Withdrawals are not enabled in test mode"><Wallet size={18} /> Withdraw earnings</button></div>
          {economyError && <p className="creator-error" role="alert">{economyError}</p>}
        </section>
      )}

      {!showEarnings && <section className="creator-dashboard-grid">
        <div className="creator-camera-panel">
          <div className="creator-panel-heading">
            <div>
              <h2>{callConnected ? "You're on a call" : "Your camera"}</h2>
              <p>
                {callConnected
                  ? `Connected with ${callerName || "caller"} · ${elapsedLabel}`
                  : (exclusiveMode ? "Go available to receive calls from your reserved buyer." : "Go live to become available for incoming calls.")}
              </p>
            </div>
            <span className={isLive ? "creator-status live" : "creator-status"}>
              <span className="creator-status-dot" />
              {isLive ? (exclusiveMode ? "AVAILABLE" : "LIVE") : "OFFLINE"}
            </span>
          </div>

          <div className="creator-video-stage">
            <video
              ref={remoteVideoRef}
              className="creator-remote-video"
              autoPlay playsInline
            />
            <video
              ref={videoRef}
              className={callConnected
                ? "creator-preview-video creator-preview-small"
                : "creator-preview-video"}
              autoPlay muted playsInline
            />

            {!isLive && (
              <div className="creator-camera-placeholder">
                <div className="creator-camera-icon"><CameraOff size={32} /></div>
                <h3>Your camera preview</h3>
                <p>{exclusiveMode ? "Go available to turn on your camera and microphone for calls." : "Go live to turn on your camera and microphone."}</p>
              </div>
            )}

            {isLive && (
              <div className="creator-live-label"><span /> {exclusiveMode ? "AVAILABLE FOR CALLS" : "LIVE NOW"}</div>
            )}
            {callConnected && (
              <div className="creator-call-label"><Phone size={14} /> Connected</div>
            )}
          </div>

          <section className="creator-chat-panel" aria-label="Call chat">
            <div className="creator-chat-heading">
              <div>
                <p className="creator-chat-eyebrow">CALL CONVERSATION</p>
                <h3>Live chat</h3>
              </div>
              <span className={callConnected ? "creator-chat-status connected" : "creator-chat-status"}>
                <span /> {callConnected ? "Connected" : "Waiting for call"}
              </span>
            </div>

            <div className="creator-chat-messages" ref={chatMessagesRef} aria-live="polite">
              {chatMessages.length === 0 ? (
                <div className="creator-chat-empty">
                  <span className="creator-chat-empty-icon">✉</span>
                  <strong>{callConnected ? "Say hello" : "Your chat will appear here"}</strong>
                  <p>{callConnected ? "You can now message the caller." : "Messages unlock when a user call connects."}</p>
                </div>
              ) : (
                chatMessages.map((item) => (
                  <div className={`creator-chat-message-row ${item.own ? "own" : ""}`} key={item.id}>
                    <div className="creator-chat-bubble">{item.text}</div>
                    <span className="creator-chat-author">{item.own ? "YOU" : (callerName || "USER")}</span>
                  </div>
                ))
              )}
              {partnerTyping && (
                <div className="creator-chat-typing">{callerName || "User"} is typing…</div>
              )}
            </div>

            <form className="creator-chat-form" onSubmit={sendChatMessage}>
              <input
                value={chatMessage}
                onChange={handleChatChange}
                maxLength={1000}
                placeholder={callConnected ? "Write a message…" : "Connect a call first…"}
                disabled={!callConnected}
                aria-label="Write a chat message"
              />
              <button type="submit" disabled={!callConnected || !chatMessage.trim()} aria-label="Send message">
                <Send size={17} />
              </button>
            </form>
          </section>

          {cameraError && (
            <p className="creator-error" role="alert">{cameraError}</p>
          )}

          {/* Incoming call popup is intentionally hidden because calls auto-accept. */}

          {!isLive ? (
            <div className="creator-camera-actions">
              <button className="creator-go-live" onClick={goLive} disabled={busy}>
                <Radio size={19} /> {busy ? "Starting camera..." : (exclusiveMode ? "Go Available" : "Go Live")}
              </button>
            </div>
          ) : (
            <>
              <div className="creator-media-controls">
                <button
                  type="button"
                  className={micMuted ? "creator-media-button is-off" : "creator-media-button"}
                  onClick={toggleMic}
                  disabled={!streamRef.current}
                  aria-pressed={micMuted}
                  title={micMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {micMuted ? <MicOff size={19} /> : <Mic size={19} />}
                  <span>{micMuted ? "Unmute" : "Mute"}</span>
                </button>

                <button
                  type="button"
                  className={cameraOff ? "creator-media-button is-off" : "creator-media-button"}
                  onClick={toggleCamera}
                  disabled={!streamRef.current}
                  aria-pressed={cameraOff}
                  title={cameraOff ? "Turn camera on" : "Turn camera off"}
                >
                  {cameraOff ? <CameraOff size={19} /> : <Camera size={19} />}
                  <span>{cameraOff ? "Camera on" : "Camera off"}</span>
                </button>

                <button
                  type="button"
                  className="creator-media-button"
                  onClick={switchCamera}
                  disabled={!streamRef.current || cameraSwitching}
                  title="Switch front/back camera"
                >
                  <RotateCw size={19} />
                  <span>{cameraSwitching ? "Switching..." : "Flip camera"}</span>
                </button>
              </div>

              <div className="creator-camera-actions">
                {callConnected && (
                  <button className="creator-end-live" onClick={endCall}>
                    <PhoneOff size={19} /> End Call
                  </button>
                )}
                <button
                  className="creator-end-live"
                  onClick={endLive}
                  disabled={isEnding}
                >
                  <VideoOff size={19} /> {isEnding ? "Ending..." : (exclusiveMode ? "Go Offline" : "End Live")}
                </button>
              </div>
            </>
          )}

          <p className="creator-camera-note">
            <ShieldCheck size={15} />
            Your browser asks permission before camera and microphone access.
          </p>
        </div>

        <aside className="creator-stats-column">
          <button type="button" className="creator-stat-card creator-earnings-link-card" onClick={() => { setShowEarnings(true); refreshEconomy(); }}>
            <div className="creator-stat-icon"><TrendingUp size={22} /></div>
            <p className="creator-stat-label">Your Earnings</p>
            <div className="creator-stat-value">₹{formatNumber(signupBonus + Number(creatorRevenue || 0))}</div>
            <p className="creator-stat-footnote">{exclusiveMode ? "View exclusive access earnings, history and graphs" : "View signup bonus, call history, graphs and withdrawal options"}</p>
            <span className="creator-earnings-link-action">View earnings <ArrowUpRight size={16} /></span>
          </button>

          {!exclusiveMode && <div className="creator-stat-card">
            <div className="creator-stat-icon"><Gift size={22} /></div>
            <p className="creator-stat-label">Creator signup bonus</p>
            <div className="creator-stat-value">
              {economyLoading ? "…" : `₹${formatNumber(signupBonus)}`}
            </div>
            <p className="creator-stat-footnote">Test signup bonus · not withdrawable</p>
          </div>}

          <div className="creator-stat-card">
            <div className="creator-stat-icon"><Wallet size={22} /></div>
            <p className="creator-stat-label">{exclusiveMode ? "Exclusive access earnings" : "Estimated creator revenue"}</p>
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
              <p className="creator-error" role="alert">{economyError}</p>
            )}
          </div>

          <div className="creator-info-card">
            <div className="creator-info-icon"><Video size={21} /></div>
            <h3>How it works</h3>
            <ul>
              <li>{exclusiveMode ? "Go Available to receive calls from your exclusive buyer." : "Go Live to publish your creator status."}</li>
              <li>{exclusiveMode ? "Incoming calls from the reserved buyer are accepted automatically while you are available." : "Incoming calls are accepted automatically while you are live."}</li>
              <li>Mute or disable your camera without ending the call.</li>
              <li>End Call stops the current call.</li>
              <li>{exclusiveMode ? "Go Offline stops the camera and microphone." : "End Live stops the camera and microphone."}</li>
            </ul>
          </div>

          <div className="creator-info-card creator-test-card">
            <div className="creator-info-icon"><Camera size={21} /></div>
            <h3>Testing version</h3>
            <p>
              {exclusiveMode
                ? "Exclusive access payments and earnings are demo values. No real payment is collected in this testing version. Production use needs secure server-side authentication, a persistent database, and a verified payment provider."
                : "Coins and revenue shown here are demo values. This is not a payment processor, and the displayed amount is not withdrawable. Production use needs secure server-side authentication, a persistent database, and a verified payment provider."}
            </p>
          </div>
        </aside>
      </section>}
    </main>
  );
}
