
import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Radio,
  Tv,
  Eye,
  RefreshCw,
} from "lucide-react";
import "./LivePage.css";

const API_URL = "/api/aw-models";
const PLAYER_SCRIPT = "https://edwmcr.com/embed/lf";

const PLAYER_CONFIG = {
  site: "jasmin",
  cobrandId: "",
  psid: "kuchbhi6677",
  pstool: "202_1",
  psprogram: "revs",
  campaign_id: "",
  category: "girl",
  "vp[showChat]": "true",
  "vp[chatAutoHide]": "",
  "vp[showCallToAction]": "",
  "vp[showPerformerName]": "",
  "vp[showPerformerStatus]": "",
  ms_notrack: "1",
  subAffId: "",
};

function getUsername(item) {
  return String(
    item?.username ||
      item?.nickname ||
      item?.displayName ||
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
      (image) =>
        typeof image === "string" &&
        image.trim().length > 0
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
      for (const key of [
        "models",
        "performers",
        "results",
        "items",
      ]) {
        if (Array.isArray(candidate[key])) {
          return candidate[key];
        }
      }
    }
  }

  return [];
}

function normalizeModel(item) {
  const username = getUsername(item);
  const age = Number(
    item?.persons?.[0]?.age ?? item?.age ?? 0
  );

  return {
    username,
    name:
      item?.displayName ||
      item?.nickname ||
      item?.username ||
      item?.performerId ||
      item?.name ||
      username ||
      "Live Model",
    age: Number.isFinite(age) ? age : 0,
    thumbnail: getThumbnail(item),
    viewers: Number(
      item?.viewers ??
        item?.viewerCount ??
        item?.viewer_count ??
        item?.numViewers ??
        0
    ) || 0,
    profileUrl: item?.chatRoomUrl || item?.profileUrl || "",
  };
}

function AWLivePlayer({ username }) {
  const [attempt, setAttempt] = useState(0);
  const [playerError, setPlayerError] = useState("");
  const [loadingPlayer, setLoadingPlayer] = useState(true);

  useEffect(() => {
    if (!username) {
      setPlayerError("No performer username was provided.");
      setLoadingPlayer(false);
      return;
    }

    const container = document.getElementById(
      "onlystream-player"
    );

    if (!container) {
      setPlayerError("Player container was not found.");
      setLoadingPlayer(false);
      return;
    }

    let cancelled = false;
    let timer;

    setLoadingPlayer(true);
    setPlayerError("");
    container.replaceChildren();

    const params = new URLSearchParams({
      c: "onlystream-player",
      ...PLAYER_CONFIG,
      "forcedPerformers[]": username,
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = `${PLAYER_SCRIPT}?${params.toString()}`;

    script.onload = () => {
      if (cancelled) return;

      // The script loading does not necessarily mean
      // the video stream has started playing.
      window.clearTimeout(timer);
      setLoadingPlayer(false);
    };

    script.onerror = () => {
      if (cancelled) return;

      window.clearTimeout(timer);
      setLoadingPlayer(false);
      setPlayerError(
        "The provider player script could not load."
      );
    };

    container.appendChild(script);

    timer = window.setTimeout(() => {
      if (cancelled) return;

      setLoadingPlayer(false);
      setPlayerError(
        "The player is taking too long to load. Check the connection or try again."
      );
    }, 25000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      container.replaceChildren();
    };
  }, [username, attempt]);

  return (
    <div className="onlystream-embed-wrap">
      <div
        id="onlystream-player"
        className="onlystream-embed"
      />

      {loadingPlayer && (
        <div className="player-error">
          <p>Loading live stream...</p>
        </div>
      )}

      {playerError && (
        <div className="player-error">
          <p>{playerError}</p>
          <p>
            The stream may be unavailable or the provider
            may have blocked the embed.
          </p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw
              size={15}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
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
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadModel() {
      setLoading(true);
      setError("");
      setModel(null);

      try {
        const response = await fetch(API_URL, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Model feed request failed (${response.status}).`
          );
        }

        const data = await response.json();
        const models = extractModels(data)
          .map(normalizeModel)
          .filter((item) => item.username);

        const selected = models.find((item) => {
          const requested = requestedModel.toLowerCase();

          return (
            item.username.toLowerCase() === requested ||
            item.name.toLowerCase() === requested
          );
        });

        if (!selected) {
          throw new Error(
            "This model was not found in the current feed. Go back and select a model from the cards."
          );
        }

        if (!cancelled) {
          setModel(selected);
        }
      } catch (err) {
        if (!cancelled && err.name !== "AbortError") {
          setError(
            err.message || "Couldn't load this model."
          );
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
  }, [requestedModel, retry]);

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
            <Tv size={15} /> LIVE MODEL
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
              onClick={() => setRetry((value) => value + 1)}
            >
              <RefreshCw
                size={15}
                style={{
                  display: "inline",
                  verticalAlign: "middle",
                  marginRight: 6,
                }}
              />
              Retry
            </button>

            <p>
              <a href="/">Back to live models</a>
            </p>
          </div>
        ) : model ? (
          <>
            <article className="live-player-card">
              <div className="live-player">
                <AWLivePlayer
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
                    {model.age > 0
                      ? `Age ${model.age}+`
                      : "Live model"}
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
