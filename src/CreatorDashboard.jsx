import React, { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { supabase } from "./supabaseClient";
import {
  ArrowLeft, Camera, CameraOff, Gift, LogOut, Phone,
  Radio, ShieldCheck, Video, VideoOff, PhoneOff, Check, X,
  RefreshCw, Wallet, Mic, MicOff, RotateCw, Send, TrendingUp, CalendarDays, ArrowUpRight
} from "lucide-react";
import "./CreatorDashboard.css";

const API_BASE = "";
let currentCreatorProfile = null;

async function loadCreatorProfile() {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  let authSession = authData?.session;
  if (!authSession?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    authSession = refreshed.data?.session;
  }
  if (!authSession?.user?.id || !authSession.access_token) return null;
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,username,role,gender,creator_plan,subscription_price,subscription_hours")
    .eq("id", authSession.user.id).maybeSingle();
  if (error) throw error;
  if (!profile) return null;
  return { ...profile, username: profile.username || authSession.user.email?.split("@")[0] || "Creator", creatorPlan: profile.creator_plan || "calls", subscriptionPrice: Number(profile.subscription_price || 499), subscriptionHours: Number(profile.subscription_hours || 24), accessToken: authSession.access_token };
}

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
    let session = currentCreatorProfile;
    try { session = await loadCreatorProfile(); currentCreatorProfile = session; } catch (error) { console.error("Could not load creator profile:", error); }

    if (!session?.username) {
      if (mountedRef.current) setEconomyLoading(false);
      return;
    }

    try {
      setEconomyLoading(true);
      setEconomyError("");

      const headers = {
        Accept: "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      };
      const economyUrl = `${API_BASE}/api/economy/me?username=${encodeURIComponent(session.username)}&role=creator`;

      if (exclusiveMode) {
        // Read the signup bonus from the authenticated, database-backed creator wallet.
        // Exclusive-sale rows are loaded separately because they use the exclusive earnings endpoint.
        const [walletResponse, exclusiveResponse] = await Promise.all([
          fetch(economyUrl, { headers, cache: "no-store" }),
          fetch(`${API_BASE}/api/exclusive-earnings?username=${encodeURIComponent(session.username)}`, { headers, cache: "no-store" }),
        ]);
        const walletData = await readJson(walletResponse);
        const exclusiveData = await readJson(exclusiveResponse);
        const walletAccount = walletData.account ?? walletData.economy ?? walletData;
        const exclusiveEarnings = exclusiveData.earnings || {};

        if (mountedRef.current) {
          setEconomy({
            ...walletAccount,
            testBonusInr: Number(walletAccount.testBonusInr ?? 1200),
            testRevenueInr: Number(exclusiveEarnings.total || 0),
            creatorRevenue: Number(exclusiveEarnings.total || 0),
          });
          setLedger((Array.isArray(exclusiveData.rows) ? exclusiveData.rows : []).map((row) => ({
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
        }
      } else {
        const response = await fetch(economyUrl, { headers, cache: "no-store" });
        const data = await readJson(response);
        if (mountedRef.current) {
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

    (async () => {
      try {
        const session = await loadCreatorProfile();
        currentCreatorProfile = session;
        if (!mountedRef.current) return;
        if (!session || session.role !== "creator") {
          window.location.replace(`/login?next=${encodeURIComponent(exclusiveMode ? "/subscription-creator" : "/creator")}`);
          return;
        }
        if (exclusiveMode && session.creatorPlan !== "subscription") {
          window.location.replace("/creator");
          return;
        }
        if (!exclusiveMode && session.creatorPlan === "subscription") {
          window.location.replace("/subscription-creator");
          return;
        }
        setUsername(session.username || "Creator");
        const response = await fetch(`${API_BASE}/api/test-account`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${session.accessToken}` },
          body: JSON.stringify({ username: session.username, role: "creator", gender: session.gender || "female" }),
          cache: "no-store",
        });
        const result = await readJson(response);
        if (!mountedRef.current) return;
        if (result?.account) setEconomy(result.account);
        await refreshEconomy();
      } catch (error) {
        if (mountedRef.current) {
          setCameraError(error?.message || "Could not load your Supabase creator profile.");
          setEconomyError(error?.message || "Could not load creator earnings.");
          setEconomyLoading(false);
        }
      }
    })();

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

    socket.on("chat-message", (payload) => {
      // The backend sends an object { text, conversationId, senderUsername }.
      // Accept strings too so older clients remain compatible.
      const incomingText =
        typeof payload === "string"
          ? payload
          : typeof payload?.text === "string"
            ? payload.text
            : "";

      if (!incomingText.trim()) return;

      setChatMessages((old) => [
        ...old,
        {
          id: `${Date.now()}-${Math.random()}`,
          text: incomingText.trim().slice(0, 1000),
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
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      let accessToken = authData?.session?.access_token || "";
      if (!accessToken && authData?.session) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.error) throw refreshed.error;
        accessToken = refreshed.data?.session?.access_token || "";
      }
      if (!accessToken) {
        throw new Error("Your login session is missing or expired. Please log in again.");
      }

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

      const session = await loadCreatorProfile();
      if (!session || session.role !== "creator") throw new Error("Your Supabase creator profile is missing. Please sign in again.");
      currentCreatorProfile = session;
      const creatorUsername = session.username || username;
      const socket = socketRef.current;

      if (!socket?.connected) {
        throw new Error("Server is not connected. Please retry.");
      }

      socket.emit("creator-go-live", {
        username: creatorUsername,
        accessToken,
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

    currentCreatorProfile = null;
    supabase.auth.signOut().finally(() => {
      window.location.replace("/login");
    });
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
            <div><p className="creator-eyebrow">CREATOR FINANCE</p><h2>Your Earnings</h2><p>{exclusiveMode ? "Your database-backed signup bonus and earnings from exclusive access purchases." : "Signup bonus and earnings from every recorded call."}</p></div>
            <div className="creator-earnings-total"><span>Total earnings</span><strong>{economyLoading ? "…" : `₹${formatNumber(totalEarned)}`}</strong><small>{exclusiveMode ? "Signup bonus + exclusive access fees" : "Signup bonus + call earnings"}</small></div>
          </div>
          <div className="creator-earnings-summary-grid">
            <article className="creator-earnings-summary"><span><Gift size={17} /> Signup bonus</span><strong>₹{formatNumber(signupBonus)}</strong></article>
            <article className="creator-earnings-summary"><span><Phone size={17} /> {exclusiveMode ? "Exclusive access earnings" : "Earnings from calls"}</span><strong>₹{formatNumber(creatorRevenue)}</strong></article>
