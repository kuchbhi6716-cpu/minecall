
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
const VIDEO_DETAILS_API = "/api/aw-video-details";
const RECORDED_CONTAINER_ID = "aw_recorded_video_container";

// ------------------------------------
// SHARED HELPERS
// ------------------------------------

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
      for (const key of [
        "models",
        "performers",
        "results",
        "items",
      ]) {
        if (Array.isArray(candidate[key])) return candidate[key];
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
    profileUrl: item?.chatRoomUrl || item?.profileUrl || "",
  };
}

function validateProviderPlayerUrl(rawUrl) {
  const url = new URL(rawUrl);

  if (
    url.protocol !== "https:" ||
    !["atwmcd.com", "www.atwmcd.com"].includes(url.hostname) ||
    !url.pathname.startsWith("/embed/")
  ) {
    throw new Error("Provider returned an invalid player URL.");
  }

  return url;
}

// ------------------------------------
// LIVE MODEL PLAYER
// ------------------------------------

function AWLivePlayer({ username }) {
  const [retry, setRetry] = useState(0);
  const [playerError, setPlayerError] = useState("");
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    const container = document.getElementById("object_container");

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

    // Keep the provider's normal controls enabled.
    params.set("vp[showChat]", "true");
    params.set("vp[chatAutoHide]", "");
    params.set("vp[showCallToAction]", "");
    params.set("vp[showPerformerName]", "");
    params.set("vp[showPerformerStatus]", "");

    // Do not add a transparent overlay over the player.
    params.set("ms_notrack", "1");
    params.set("subAffId", "");

    // IMPORTANT:
    // Do not guess undocumented click-blocking parameters here.
    // Use AW Empire's documented embed option if available.
    params.append("forcedPerformers[]", username);

    const script = document.createElement("script");
    script.async = true;
    script.src = `${PLAYER_SCRIPT}?${params.toString()}`;

    function cleanup() {
      window.clearTimeout(timeoutId);

      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    function checkPlayer() {
      if (cancelled) return false;

      const player = container.querySelector(
        "iframe, video, object, embed"
      );

      if (!player) return false;

      setPlayerReady(true);
      cleanup();
      return true;
    }

    script.onload = () => {
      if (cancelled || checkPlayer()) return;

      observer = new MutationObserver(() => {
        checkPlayer();
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
      });

      timeoutId = window.setTimeout(() => {
        if (!cancelled && !checkPlayer()) {
          setPlayerError(
            "Player load nahi hua. Provider embed settings check karo."
          );
        }
      }, 20000);

      checkPlayer();
    };

    script.onerror = () => {
      if (!cancelled) {
        setPlayerError(
          "Live player script load nahi hua. Retry karke dekho."
        );
      }
    };

    container.appendChild(script);

    return () => {
      cancelled = true;
      cleanup();
      container.replaceChildren();
    };
  }, [username, retry]);

  return (
    <div className="onlystream-embed-wrap">
      <div id="object_container" className="onlystream-embed" />

      {!playerReady && !playerError && (
        <div className="video-skeleton" aria-live="polite">
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
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry player
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------
// RECORDED VIDEO PLAYER
// ------------------------------------

function AWRecordedVideoPlayer({ videoId, title }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadDetails() {
      setLoading(true);
      setPlayerLoading(false);
      setError("");
      setDetails(null);

      try {
        const response = await fetch(
          `${VIDEO_DETAILS_API}?video=${encodeURIComponent(videoId)}`,
          {
            headers: { Accept: "application/json" },
            signal: controller.signal,
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result?.details ||
              result?.error ||
              `Video details error (${response.status})`
          );
        }

        const videoDetails = result?.data ?? result;
        const rawPlayerUrl =
          typeof videoDetails?.playerEmbedUrl === "string"
            ? videoDetails.playerEmbedUrl.trim()
            : "";

        if (!rawPlayerUrl) {
          throw new Error(
            "Player URL nahi mila. API response mein playerEmbedUrl missing hai."
          );
        }

        const playerUrl = validateProviderPlayerUrl(rawPlayerUrl);
        playerUrl.searchParams.set("c", RECORDED_CONTAINER_ID);

        if (!cancelled) {
          setDetails({
            ...videoDetails,
            playerEmbedUrl: playerUrl.toString(),
          });
        }
      } catch (err) {
        if (!cancelled && err.name !== "AbortError") {
          setError(err.message || "Video details load nahi hue.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (videoId) {
      loadDetails();
    } else {
      setError("Video ID missing hai.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [videoId, retry]);

  useEffect(() => {
    if (!details?.playerEmbedUrl) return undefined;

    const container = document.getElementById(
      RECORDED_CONTAINER_ID
    );

    if (!container) return undefined;

    let cancelled = false;
    let timeoutId;
    let observer;

    container.replaceChildren();
    setError("");
    setPlayerLoading(true);

    function cleanup() {
      window.clearTimeout(timeoutId);

      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    function fail(message) {
      if (cancelled) return;

      cleanup();
      setPlayerLoading(false);
      setError(message);
    }

    function checkPlayer() {
      if (cancelled) return false;

      const player = container.querySelector(
        "iframe, video, object, embed"
      );

      if (!player) return false;

      cleanup();
      setPlayerLoading(false);
      return true;
    }

    try {
      const playerUrl = validateProviderPlayerUrl(
        details.playerEmbedUrl
      );

      playerUrl.searchParams.set("c", RECORDED_CONTAINER_ID);

      const script = document.createElement("script");
      script.async = true;
      script.src = playerUrl.toString();

      script.onload = () => {
        if (cancelled || checkPlayer()) return;

        observer = new MutationObserver(checkPlayer);
        observer.observe(container, {
          childList: true,
          subtree: true,
        });

        timeoutId = window.setTimeout(() => {
          if (!cancelled && !checkPlayer()) {
            fail(
              "Provider script load hua, lekin player nahi bana. Browser console aur provider embed permissions check karo."
            );
          }
        }, 20000);

        checkPlayer();
      };

      script.onerror = () => {
        fail(
          "Video player script load nahi hua. Provider access ya embed URL check karo."
        );
      };

      container.appendChild(script);
    } catch (err) {
      fail(err.message || "Invalid player URL.");
    }

    return () => {
      cancelled = true;
      cleanup();
      container.replaceChildren();
    };
  }, [details]);

  if (loading) {
    return (
      <div className="live-player-message">
        Loading recorded video details...
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="live-player-message">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
        >
          Retry video
        </button>
        <p><a href="/">Back to homepage</a></p>
      </div>
    );
  }

  return (
    <>
      <article className="live-player-card">
        <div className="live-player">
          <div className="onlystream-embed-wrap recorded-video-wrap">
            <div
              id={RECORDED_CONTAINER_ID}
              className="onlystream-embed recorded-video-container"
            />

            {playerLoading && !error && (
              <div className="recorded-video-loading" aria-live="polite">
                <div className="video-spinner" />
                <p>Connecting to video player...</p>
                <span>This may take a few seconds.</span>
              </div>
            )}

            {error && (
              <div className="recorded-video-loading">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry video
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="live-details">
          <div className="live-avatar">▶</div>
          <div className="live-channel-info">
            <h2>{details?.title || title || "Recorded video"}</h2>
            <p>Recorded video</p>
            {details?.duration != null && (
              <span className="live-note">
                Duration: {String(details.duration)}
              </span>
            )}
          </div>
          <span className="live-status">
            <Tv size={15} /> VIDEO
          </span>
        </div>
      </article>

      <section className="more-live">
        <h3>Explore more videos</h3>
        <p>Discover more content.</p>
        <a href="/">Back to homepage →</a>
      </section>
    </>
  );
}

// ------------------------------------
// PAGE
// ------------------------------------

export default function LivePage() {
  const params = new URLSearchParams(window.location.search);

  const requestedModel = (params.get("model") || "").trim();
  const requestedVideo = (params.get("video") || "").trim();
  const requestedTitle = (params.get("title") || "").trim();
  const isVideoPage = Boolean(requestedVideo);

  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (isVideoPage) {
      setLoading(false);
      setError("");
      setModel(null);
      return undefined;
    }

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
  }, [requestedModel, reload, isVideoPage]);

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
          {isVideoPage ? (
            <><Tv size={15} /> VIDEO</>
          ) : (
            <><Radio size={15} /> LIVE</>
          )}
        </span>
      </header>

      <section className="live-content">
        <div className="live-heading">
          <span className="live-eyebrow">
            {isVideoPage ? (
              <><Tv size={15} /> RECORDED VIDEO</>
            ) : (
              <><Tv size={15} /> LIVE MODEL</>
            )}
          </span>

          <h1>
            {isVideoPage ? (
              <>Watch <span>video.</span></>
            ) : (
              <>Watch <span>live.</span></>
            )}
          </h1>

          <p>
            {isVideoPage
              ? requestedTitle || "Watch the selected video."
              : "Watch creators on OnlyStream."}
          </p>
        </div>

        {isVideoPage ? (
          <AWRecordedVideoPlayer
            key={requestedVideo}
            videoId={requestedVideo}
            title={requestedTitle}
          />
        ) : loading ? (
          <div className="live-player-message">Loading model...</div>
        ) : error ? (
          <div className="live-player-message">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              Retry
            </button>
            <p><a href="/">Back to live models</a></p>
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

