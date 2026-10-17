
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Radio,
  Eye,
} from "lucide-react";
import "./LivePage.css";

const API_URL = "/api/aw-models";
const PLAYER_WIDTH = 350;
const PLAYER_HEIGHT = 210;

function warmUpProvider() {
  ["https://atwmcd.com", "https://edwmcr.com"].forEach((url) => {
    const exists = document.querySelector(
      `link[rel="preconnect"][href="${url}"]`
    );

    if (exists) return;

    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = url;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  });
}

warmUpProvider();

function getUsername(item) {
  return String(
    item?.username ||
      item?.nickname ||
      item?.performerId ||
      item?.performer_id ||
      item?.id ||
      item?.name ||
      ""
  ).trim();
}

function getThumbnail(item) {
  const images = [
    item?.profilePictureUrl?.size800x600,
    item?.profilePictureUrl?.size320x180,
    item?.thumbnail,
    item?.thumb,
    item?.thumb_big,
    item?.profile_thumb_sfw,
    item?.profile_thumb,
    item?.image,
    item?.imageUrl,
    item?.image_url,
  ];

  return (
    images.find(
      (image) => typeof image === "string" && image.trim()
    ) || ""
  );
}

function extractModels(response) {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== "object") return [];

  const candidates = [
    response.data?.models,
    response.models,
    response.data?.performers,
    response.performers,
    response.data?.results,
    response.results,
    response.data?.items,
    response.items,
    response.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;

    if (candidate && typeof candidate === "object") {
      for (const key of ["models", "performers", "results", "items"]) {
        if (Array.isArray(candidate[key])) return candidate[key];
      }
    }
  }

  return [];
}

function normalizeModel(item) {
  const age = Number(item?.persons?.[0]?.age ?? item?.age ?? 0);

  return {
    username: getUsername(item),
    name:
      item?.displayName ||
      item?.nickname ||
      item?.username ||
      item?.performerId ||
      item?.name ||
      "Live Model",
    age: Number.isFinite(age) ? age : 0,
    thumbnail: getThumbnail(item),
    viewers:
      Number(
        item?.viewers ??
          item?.viewerCount ??
          item?.viewer_count ??
          item?.numViewers ??
          0
      ) || 0,
    profileUrl: item?.chatRoomUrl || item?.profileUrl || "",
  };
}

// Generic fixed-size player container.
// Connect a provider-supported player integration here.
function LivePlayer({ username }) {
  const containerRef = useRef(null);
  const [playerError, setPlayerError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let cancelled = false;
    let timeoutId;

    container.replaceChildren();
    setPlayerError("");

    // This container intentionally does not invent a provider URL.
    // Add your provider's documented embed integration here.

    timeoutId = window.setTimeout(() => {
      if (!cancelled && container.childElementCount === 0) {
        setPlayerError(
          "Player integration abhi configure nahi hua hai."
        );
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      container.replaceChildren();
    };
  }, [username, retry]);

  return (
    <div
      className="onlystream-embed-wrap"
      style={{
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
        position: "relative",
        flex: "0 0 auto",
        overflow: "hidden",
        background: "#08080c",
      }}
    >
      <div
        ref={containerRef}
        className="onlystream-embed"
        style={{
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
          overflow: "hidden",
        }}
      />

      {playerError && (
        <div className="player-error">
          <p>{playerError}</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry player
          </button>
        </div>
      )}
    </div>
  );
}

export default function LivePage() {
  const params = new URLSearchParams(window.location.search);
  const requestedModel = (params.get("model") || "").trim();

  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadModel() {
      setLoading(true);
      setError("");
      setModel(null);

      try {
        const response = await fetch(API_URL, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Model feed error (${response.status}).`);
        }

        const data = await response.json();

        const models = extractModels(data)
          .filter((item) => item && typeof item === "object")
          .map(normalizeModel)
          .filter((item) => item.username);

        const target = requestedModel.toLowerCase();

        const selected = models.find(
          (item) =>
            item.username.toLowerCase() === target ||
            item.name.toLowerCase() === target
        );

        if (!selected) {
          throw new Error(
            "Model not found in the current feed. Go home and select another model."
          );
        }

        if (!cancelled) setModel(selected);
      } catch (err) {
        if (!cancelled && err.name !== "AbortError") {
          setError(err.message || "Unable to load this model.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (requestedModel) {
      loadModel();
    } else {
      setError("No model selected. Return to the homepage.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [requestedModel, reload]);

  return (
    <main className="live-page">
      <header className="live-topbar">
        <a className="live-back" href="/">
          <ArrowLeft size={20} />
          <span>Home</span>
        </a>

        <a className="live-brand" href="/">
          OnlyStream<span>.</span>
        </a>

        <span className="live-status">
          <Radio size={15} /> LIVE
        </span>
      </header>

      <section className="live-content">
        <div className="live-heading">
          <span className="live-eyebrow">
            <Radio size={15} /> LIVE MODEL
          </span>

          <h1>
            Watch <span>live.</span>
          </h1>

          <p>Watch creators on OnlyStream.</p>
        </div>

        {loading ? (
          <div className="live-player-message">
            Loading model...
          </div>
        ) : error ? (
          <div className="live-player-message">
            <p>{error}</p>

            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              Retry
            </button>

            <p>
              <a href="/">Back to live models</a>
            </p>
          </div>
        ) : model ? (
          <>
            <article className="live-player-card">
              <div
                className="live-player"
                style={{
                  width: PLAYER_WIDTH,
                  height: PLAYER_HEIGHT,
                  minHeight: PLAYER_HEIGHT,
                  maxHeight: PLAYER_HEIGHT,
                  aspectRatio: "auto",
                  flex: "0 0 auto",
                  padding: 0,
                  overflow: "hidden",
                }}
              >
                <LivePlayer
                  key={model.username}
                  username={model.username}
                />
              </div>

              <div className="live-details">
                <div className="live-avatar">
                  {model.name.charAt(0).toUpperCase()}
                </div>

                <div className="live-channel-info">
                  <h2>{model.name}</h2>

                  <p>
                    {model.age > 0 ? `Age ${model.age}+` : "Live model"}
                  </p>

                  <span className="live-note">
                    <Eye
                      size={14}
                      style={{
                        display: "inline",
                        verticalAlign: "middle",
                      }}
                    />{" "}
                    {model.viewers.toLocaleString()} watching
                  </span>
                </div>

                {model.profileUrl && (
                  <a
                    className="live-open-twitch"
                    href={model.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open provider room"
                  >
                    <ExternalLink size={18} />
                  </a>
                )}
              </div>
            </article>

            <section className="more-live">
              <h3>Explore more models</h3>
              <p>Discover other creators.</p>
              <a href="/">Browse live models →</a>
            </section>
          </>
        ) : null}

        <footer className="live-footer">
          Powered by OnlyStream
        </footer>
      </section>
    </main>
  );
}

