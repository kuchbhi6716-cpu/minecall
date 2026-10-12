
const socket = io();

const $ = (id) => document.getElementById(id);

const status = $("status");
const localVideo = $("local");
const remoteVideo = $("remote");
const messages = $("messages");
const messageInput = $("message");

let stream = null;
let peer = null;
let matched = false;
let searching = false;
let session = 0;
let makingOffer = false;
let pendingCandidates = [];

const iceConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

function setStatus(text) {
  status.textContent = text;
}

function addMessage(text, mine = false) {
  const item = document.createElement("div");
  item.className = "message" + (mine ? " mine" : "");
  item.textContent = text;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function clearChat() {
  messages.replaceChildren();
}

function closePeer() {
  if (peer) {
    peer.ontrack = null;
    peer.onicecandidate = null;
    peer.close();
    peer = null;
  }

  pendingCandidates = [];
  remoteVideo.srcObject = null;
  matched = false;
  makingOffer = false;
  messageInput.disabled = true;
  $("send").disabled = true;
}

function createPeer(mySession) {
  closePeer();
  matched = true;
  messageInput.disabled = false;
  $("send").disabled = false;

  const pc = new RTCPeerConnection(iceConfig);
  peer = pc;

  stream.getTracks().forEach(track => {
    pc.addTrack(track, stream);
  });

  pc.ontrack = event => {
    if (mySession !== session || peer !== pc) return;

    remoteVideo.srcObject = event.streams[0];
    setStatus("Connected! Say hello 👋");
  };

  pc.onicecandidate = event => {
    if (event.candidate &&
        mySession === session &&
        peer === pc) {
      socket.emit("signal", {
        type: "candidate",
        candidate: event.candidate
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (mySession !== session || peer !== pc) return;

    if (pc.connectionState === "connected") {
      setStatus("Video connected!");
    } else if (pc.connectionState === "failed") {
      setStatus("Video failed. Tap Next to retry.");
    }
  };

  return pc;
}

async function flushCandidates(pc) {
  while (pendingCandidates.length && peer === pc) {
    const candidate = pendingCandidates.shift();

    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        console.error("ICE candidate error:", error);
      }
    }
  }
}

async function handleSignal(data) {
  if (!matched || !stream || !data) return;

  const mySession = session;

  try {
    if (data.type === "offer") {
      const pc = createPeer(mySession);

      await pc.setRemoteDescription(data.sdp);
      await flushCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (mySession !== session || peer !== pc) return;

      socket.emit("signal", {
        type: "answer",
        sdp: pc.localDescription
      });
    } else if (data.type === "answer" && peer) {
      const pc = peer;

      await pc.setRemoteDescription(data.sdp);
      await flushCandidates(pc);
    } else if (data.type === "candidate" && data.candidate) {
      if (peer && peer.remoteDescription) {
        await peer.addIceCandidate(data.candidate);
      } else {
        pendingCandidates.push(data.candidate);
      }
    }
  } catch (error) {
    console.error("Video signaling error:", error);
    setStatus("Could not connect video. Try Next.");
  }
}

socket.on("connect", () => {
  setStatus("Ready to connect?");
});

socket.on("waiting", () => {
  searching = true;
  setStatus("Searching for a stranger...");
});

socket.on("matched", async data => {
  searching = false;
  matched = true;
  clearChat();
  addMessage("You're connected to a stranger. Be respectful!");

  messageInput.disabled = false;
  $("send").disabled = false;
  setStatus("Stranger found! Connecting video...");

  const mySession = session;

  if (data && data.initiator) {
    try {
      const pc = createPeer(mySession);
      makingOffer = true;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (mySession !== session || peer !== pc) return;

      socket.emit("signal", {
        type: "offer",
        sdp: pc.localDescription
      });
    } catch (error) {
      console.error(error);
      setStatus("Could not start video. Try Next.");
    } finally {
      makingOffer = false;
    }
  }
});

socket.on("signal", handleSignal);

socket.on("chat-message", text => {
  if (matched && typeof text === "string") {
    addMessage("Stranger: " + text);
  }
});

socket.on("partner-left", () => {
  session++;
  closePeer();
  searching = false;
  setStatus("Stranger left. Tap Next to find someone else.");
  addMessage("The stranger disconnected.");
});

$("start").onclick = async () => {
  $("start").disabled = true;

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera requires a secure HTTPS connection.");
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });

    localVideo.srcObject = stream;
    $("next").disabled = false;
    $("stop").disabled = false;

    if (!socket.connected) socket.connect();

    setStatus("Camera ready. Finding someone...");
    socket.emit("find-stranger");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Camera/microphone permission failed.");
    $("start").disabled = false;
  }
};

$("next").onclick = () => {
  if (!stream || !socket.connected) return;

  session++;
  closePeer();
  clearChat();
  setStatus("Finding your next stranger...");
  socket.emit("next-stranger");
};

$("stop").onclick = () => {
  session++;
  closePeer();
  searching = false;

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  localVideo.srcObject = null;
  $("start").disabled = false;
  $("next").disabled = true;
  $("stop").disabled = true;

  if (socket.connected) {
    socket.disconnect();
  }

  setStatus("Stopped. Start again whenever you're ready.");
};

$("chat-form").onsubmit = event => {
  event.preventDefault();

  const text = messageInput.value.trim();

  if (!text || !matched || !socket.connected) return;

  socket.emit("chat-message", text.slice(0, 1000));
  addMessage("You: " + text.slice(0, 1000), true);
  messageInput.value = "";
};

window.addEventListener("beforeunload", () => {
  if (stream) stream.getTracks().forEach(track => track.stop());
  if (peer) peer.close();
});

const muteButton = document.createElement("button");
muteButton.textContent = "Mute mic";
muteButton.disabled = true;
muteButton.onclick = () => {
  const track = stream?.getAudioTracks()[0];
  if (!track) return;

  track.enabled = !track.enabled;
  muteButton.textContent = track.enabled ? "Mute mic" : "Unmute mic";
};

const cameraButton = document.createElement("button");
cameraButton.textContent = "Turn camera off";
cameraButton.disabled = true;
cameraButton.onclick = () => {
  const track = stream?.getVideoTracks()[0];
  if (!track) return;

  track.enabled = !track.enabled;
  cameraButton.textContent =
    track.enabled ? "Turn camera off" : "Turn camera on";
};

$("start").parentElement.append(muteButton, cameraButton);

$("start").addEventListener("click", () => {
  muteButton.disabled = false;
  cameraButton.disabled = false;
});

$("stop").addEventListener("click", () => {
  muteButton.disabled = true;
  cameraButton.disabled = true;
});
