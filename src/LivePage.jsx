import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Radio,
  Tv,
  Eye,
} from "lucide-react";
import "./LivePage.css";

const API_URL = "/api/aw-models";
const PLAYER_SCRIPT = "https://edwmcr.com/embed/lf";

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
      (image) =>
        typeof image === "string" && image.trim()
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
  const age = Number(
    item?.persons?.[0]?.age ?? item?.age ?? 0
  );

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
    profileUrl:
      item?.chatRoomUrl || item?.profileUrl || "",
  };
}

function AWLivePlayer({ username }) {
  const [retry, setRetry] = useState(0);
  const [playerError, setPlayerError] = useState("");
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    const container = document.getElementById(
      "object_container"
    );

    if (!container || !username) {
      setPlayerError("No model selected.");
      return undefined;
    }

    let cancelled = false;
    let timeoutId;
    let observer;

    container.replaceChildren();
    setPlayerError("");
    setPlayerReady(false);

    const params = new URLSearchParams();

    params.set("c", "object_container");
    params.set("site", "jasmin");
    params.set("cobrandId", "");
    params.set("psid", "kuchbhi6677");
    params.set("pstool", "202_1");
    params.set("psprogram", "revs");
    params.set("campaign_id", "");
    params.set("category", "girl");
    params.set("vp[showChat]", "true");
    params.set("vp[chatAutoHide]", "");
    params.set("vp[showCallToAction]", "");
    params.set("vp[showPerformerName]", "");
    params.set("vp[showPerformerStatus]", "");
    params.set("ms_notrack", "1");
    params.set("subAffId", "");
    params.append("forcedPerformers[]", username);

    const script = document.createElement("script");

    script.async = true;
    script.src = `${PLAYER_SCRIPT}?${params.toString()}`;

    function checkPlayer() {
      if (cancelled) return false;

      const iframe = container.querySelector("iframe");
      const video = container.querySelector("video");
      const embed = container.querySelector("object, embed");

      // A provider iframe can load its video internally.
      // Its playback state may not be accessible to this page.
      if (
        iframe ||
        embed ||
        (video && video.readyState >= 2)
      ) {
        setPlayerReady(true);

        if (observer) {
          observer.disconnect();
          observer = null;
        }

        return true;
      }

      return false;
    }

    script.onerror = () => {
      if (cancelled) return;

      setPlayerError(
        "Player script load nahi hua. Retry karke dekho."
      );
    };

    script.onload = () => {
      if (cancelled) return;

      if (!checkPlayer()) {
        observer = new MutationObserver(() => {
          checkPlayer();
        });

        observer.observe(container, {
          childList: true,
          subtree: true,
        });
      }
    };

    container.appendChild(script);

    timeoutId = window.setTimeout(() => {
      if (cancelled) return;

      if (!checkPlayer()) {
        setPlayerError(
          "Player nahi mila. Model username ya embed configuration check karo."
        );
      }
    }, 20000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);

      if (observer) {
        observer.disconnect();
      }

      container.replaceChildren();
    };
  }, [username, retry]);

  return (
    <div className="onlystream-embed-wrap">
      <div
        id="object_container"
        className="onlystream-embed"
      />

      {!playerReady && !playerError && (
        <div
          className="video-skeleton"
          aria-live="polite"
        >
          <div className="skeleton-glow" />

          <div className="skeleton-content">
            <div className="skeleton-orb">▶</div>
            <div className="skeleton-line" />

            <div className="skeleton-caption">
              Connecting to live stream...
            </div>
          </div>

          <div className="skeleton-progress">
            <div />
          </div>
        </div>
      )}

      {playerError && (
        <div className="player-error">
          <p>{playerError}</p>

          <button
            type="button"
            onClick={() =>
              setRetry((current) => current + 1)
            }
          >
            Retry player
          </button>
        </div>
      )}
    </div>
  );
}

export default function LivePage() {
  const requestedModel = (
    new URLSearchParams(window.location.search).get(
      "model"
    ) || ""
  ).trim();

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
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Model feed error (${response.status}).`
          );
        }

        const data = await response.json();

        const models = extractModels(data)
          .filter(
            (item) =>
              item && typeof item === "object"
          )
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

        if (!cancelled) {
          setModel(selected);
        }
      } catch (err) {
        if (
          !cancelled &&
          err.name !== "AbortError"
        ) {
          setError(
            err.message || "Unable to load this model."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (requestedModel) {
      loadModel();
    } else {
      setError(
        "No model selected. Return to the homepage."
      );
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
              onClick={() =>
                setReload((current) => current + 1)
              }
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
              <a href="/">
                Browse live models →
              </a>
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
