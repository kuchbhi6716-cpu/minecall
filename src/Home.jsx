
import React, { useEffect, useState } from "react";
import {
  Video,
  ArrowUpRight,
  Sparkles,
  Radio,
  Eye,
  ChevronDown,
  Play,
  Clapperboard,
} from "lucide-react";
import "./Home.css";

const API_URL = "/api/aw-models";
const VIDEOS_API_URL = "/api/aw-videos";
const REFRESH_INTERVAL = 45000;

function normalizeImageUrl(url) {
  if (typeof url !== "string") return "";
  const value = url.trim();
  return value.startsWith("//") ? `https:${value}` : value;
}

function getModelUsername(model) {
  return String(
    model?.performerId ||
      model?.performer_id ||
      model?.username ||
      model?.nickname ||
      model?.id ||
      model?.name ||
      ""
  ).trim();
}

function getModelName(model) {
  return (
    model?.displayName ||
    model?.nickname ||
    model?.username ||
    model?.performerId ||
    model?.name ||
    "Live Model"
  );
}

function getModelThumbnail(model) {
  const images = [
    model?.profilePictureUrl?.size320x180,
    model?.profilePictureUrl?.size800x600,
    model?.thumbnail,
    model?.thumb,
    model?.thumb_big,
    model?.profile_thumb_sfw,
    model?.profile_thumb,
    model?.image,
    model?.imageUrl,
    model?.image_url,
    model?.images?.["320x180"],
    model?.images?.["800x600"],
    model?.images?.medium,
    model?.images?.large,
    model?.imageSizes?.["320x180"],
    model?.imageSizes?.["800x600"],
  ];

  const image = images.find(
    (value) => typeof value === "string" && value.trim()
  );

  return image ? normalizeImageUrl(image) : "";
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

  for (const list of candidates) {
    if (Array.isArray(list)) return list;

    if (list && typeof list === "object") {
      for (const key of ["models", "performers", "results", "items"]) {
        if (Array.isArray(list[key])) return list[key];
      }
    }
  }

  return [];
}

function extractVideos(response) {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== "object") return [];

  for (const container of [
    response,
    response.data,
    response.result,
    response.results,
  ]) {
    if (Array.isArray(container)) return container;
    if (!container || typeof container !== "object") continue;

    for (const key of [
      "videos",
      "items",
      "results",
      "data",
      "videoList",
      "video_list",
    ]) {
      if (Array.isArray(container[key])) return container[key];
    }
  }

  return [];
}

function getVideoId(video) {
  return String(
    video?.id ||
      video?.videoId ||
      video?.video_id ||
      video?.clipId ||
      video?.clip_id ||
      video?.uuid ||
      ""
  ).trim();
}

function getVideoTitle(video, index) {
  return (
    video?.title ||
    video?.name ||
    video?.videoTitle ||
    video?.video_title ||
    video?.performerName ||
    video?.performer_name ||
    `Video ${index + 1}`
  );
}

function getVideoThumbnail(video) {
  const preview = Array.isArray(video?.previewImages)
    ? video.previewImages.find(
        (item) => typeof item === "string" && item.trim()
      )
    : "";

  const candidates = [
    video?.thumbImage,
    video?.thumbnail,
    video?.thumbnailUrl,
    video?.thumbnail_url,
    video?.thumb,
    video?.coverImage,
    video?.cover_image,
    video?.image,
    video?.imageUrl,
    video?.image_url,
    preview,
    video?.preview,
    video?.previewUrl,
    video?.preview_url,
    video?.poster,
  ];

  const image = candidates.find(
    (value) =>
      typeof value === "string" &&
      /^(https?:)?\/\//i.test(value.trim())
  );

  return image ? normalizeImageUrl(image) : "";
}

function getVideoViews(video) {
  const value =
    video?.views ??
    video?.viewCount ??
    video?.view_count ??
    video?.viewsCount ??
    video?.views_count;

  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeModels(list) {
  const normalized = list
    .filter(
      (model) =>
        model &&
        typeof model === "object" &&
        getModelUsername(model)
    )
    .map((model) => {
      const age = Number(
        model?.persons?.[0]?.age ?? model?.age ?? 0
      );

      return {
        ...model,
        username: getModelUsername(model),
        name: getModelName(model),
        thumbnail: getModelThumbnail(model),
        age: Number.isFinite(age) ? age : 0,
      };
    });

  return Array.from(
    new Map(
      normalized.map((model) => [
        model.username.toLowerCase(),
        model,
      ])
    ).values()
  );
}

function normalizeVideos(list) {
  return list
    .filter((video) => video && typeof video === "object")
    .map((video, index) => ({
      ...video,
      _videoId: getVideoId(video),
      _title: getVideoTitle(video, index),
      _thumbnail: getVideoThumbnail(video),
      _views: getVideoViews(video),
    }));
}

function getRandomViewerCount() {
  return Math.floor(Math.random() * 121) + 80;
}

function ModelCard({ model, viewers }) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [model.thumbnail]);

  function openModel() {
    window.location.href =
      "/live?model=" + encodeURIComponent(model.username);
  }

  return (
    <article className="stream-card model-card">
      <button
        type="button"
        className="model-card-click"
        onClick={openModel}
        aria-label={`View ${model.name}`}
      >
        {!imageError && model.thumbnail ? (
          <img
            className="model-thumbnail"
            src={model.thumbnail}
            alt={`${model.name} thumbnail`}
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="model-thumbnail model-thumbnail-fallback">
            <Radio size={32} />
          </div>
        )}

        <span className="model-online">● LIVE</span>

        <div className="stream-info">
          <h3>{model.name}</h3>
          <p>
            {model.age > 0 ? `${model.age}+ · ` : ""}
            <Eye
              size={14}
              style={{
                display: "inline",
                verticalAlign: "middle",
              }}
            />{" "}
            {viewers.toLocaleString()}
          </p>
        </div>
      </button>
    </article>
  );
}

function VideoCard({ video, index }) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [video._thumbnail]);

  function openVideo() {
    if (!video._videoId) {
      console.error("This video has no ID:", video);
      return;
    }

    const params = new URLSearchParams({
      video: video._videoId,
      title: video._title,
    });

    window.location.href = `/live?${params.toString()}`;
  }

  return (
    <article className="recorded-card">
      <button
        type="button"
        className="recorded-card-click"
        onClick={openVideo}
        aria-label={`Play ${video._title || `Video ${index + 1}`}`}
      >
        <div className="recorded-thumbnail-wrap">
          {!imageError && video._thumbnail ? (
            <img
              className="recorded-thumbnail"
              src={video._thumbnail}
              alt={video._title}
              loading="lazy"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="recorded-thumbnail recorded-thumbnail-fallback">
              <Clapperboard size={30} />
            </div>
          )}

          <span className="recorded-play">
            <Play size={20} fill="currentColor" />
          </span>
        </div>

        <div className="recorded-info">
          <h3>{video._title || `Video ${index + 1}`}</h3>
          {video._views !== null && (
            <p>
              <Eye size={13} />
              {video._views.toLocaleString()} views
            </p>
          )}
        </div>
      </button>
    </article>
  );
}

export default function Home() {
  const [models, setModels] = useState([]);
  const [viewerCounts, setViewerCounts] = useState({});
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");

  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState("");

  const [showMoreSections, setShowMoreSections] = useState(false);
  const [showMoreVideoSections, setShowMoreVideoSections] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadModels() {
      try {
        const response = await fetch(API_URL, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const normalized = normalizeModels(extractModels(data));

        if (!active) return;

        setModels(normalized);
        setModelsError(
          normalized.length ? "" : "No models found in the API response."
        );
      } catch (error) {
        if (active) {
          setModelsError(error.message || "Could not load live models.");
        }
      } finally {
        if (active) setModelsLoading(false);
      }
    }

    loadModels();

    const interval = window.setInterval(loadModels, REFRESH_INTERVAL);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadVideos() {
      try {
        const response = await fetch(VIDEOS_API_URL, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const normalized = normalizeVideos(extractVideos(data));

        if (!active) return;

        setVideos(normalized);
        setVideosError(
          normalized.length ? "" : "The API returned no recognized videos."
        );
      } catch (error) {
        if (active) {
          setVideosError(error.message || "Could not load videos.");
        }
      } finally {
        if (active) setVideosLoading(false);
      }
    }

    loadVideos();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!models.length) return;

    function updateCounts() {
      const counts = {};

      models.forEach((model) => {
        counts[model.username] = getRandomViewerCount();
      });

      setViewerCounts(counts);
    }

    updateCounts();

    const interval = window.setInterval(updateCounts, REFRESH_INTERVAL);

    return () => window.clearInterval(interval);
  }, [models]);

  const sectionSize = Math.ceil(models.length / 5);

  const liveSections = [
    {
      title: "Models Live Now",
      subtitle: "Discover who's online",
      color: "purple",
      models: models.slice(0, sectionSize),
    },
    {
      title: "Trending Now",
      subtitle: "Live models to discover",
      color: "blue",
      models: models.slice(sectionSize, sectionSize * 2),
    },
    {
      title: "Popular Creators",
      subtitle: "More creators to discover",
      color: "pink",
      models: models.slice(sectionSize * 2, sectionSize * 3),
    },
    {
      title: "Just For You",
      subtitle: "Discover more creators",
      color: "green",
      models: models.slice(sectionSize * 3, sectionSize * 4),
    },
    {
      title: "Explore More",
      subtitle: "Keep discovering",
      color: "purple",
      models: models.slice(sectionSize * 4),
    },
  ];

  const videoSectionSize = Math.max(1, Math.ceil(videos.length / 5));

  const videoSections = [
    {
      title: "Recorded Videos",
      subtitle: "Explore recorded content",
      videos: videos.slice(0, videoSectionSize),
    },
    {
      title: "Trending Videos",
      subtitle: "More videos to discover",
      videos: videos.slice(videoSectionSize, videoSectionSize * 2),
    },
    {
      title: "Most Watched",
      subtitle: "Popular videos",
      videos: videos.slice(videoSectionSize * 2, videoSectionSize * 3),
    },
    {
      title: "Recently Added",
      subtitle: "Discover more videos",
      videos: videos.slice(videoSectionSize * 3, videoSectionSize * 4),
    },
    {
      title: "Explore Videos",
      subtitle: "Keep exploring",
      videos: videos.slice(videoSectionSize * 4),
    },
  ];

  function startChatting() {
    window.location.href = "/call";
  }

  function renderLiveSection(section) {
    return (
      <section className="category-section" key={section.title}>
        <div className="category-heading">
          <div className="category-title-wrap">
            <span className={`category-icon ${section.color}`}>
              <Radio size={19} />
            </span>
            <div>
              <h2>{section.title}</h2>
              <p>{section.subtitle}</p>
            </div>
          </div>

          <span className="online-status">
            ● {section.models.length} models
          </span>
        </div>

        {section.models.length === 0 ? (
          <p>No more models in this section.</p>
        ) : (
          <div className="category-track">
            {section.models.map((model) => (
              <ModelCard
                key={model.username}
                model={model}
                viewers={viewerCounts[model.username] ?? 80}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderVideoSection(section) {
    if (!section.videos.length) return null;

    return (
      <section className="category-section" key={section.title}>
        <div className="category-heading">
          <div className="category-title-wrap">
            <span className="category-icon pink">
              <Clapperboard size={19} />
            </span>
            <div>
              <h2>{section.title}</h2>
              <p>{section.subtitle}</p>
            </div>
          </div>

          <span className="online-status">
            ● {section.videos.length} videos
          </span>
        </div>

        <div className="recorded-track">
          {section.videos.map((video, index) => (
            <VideoCard
              key={video._videoId || `${section.title}-${index}`}
              video={video}
              index={index}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <main className="minebbe">
      <nav className="navbar">
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>
        <span className="online-status">● We're online</span>
      </nav>

      <section className="hero">
        <span className="eyebrow">
          YOUR NEXT CONVERSATION STARTS HERE
        </span>

        <h1>
          Meet someone
          <br />
          <span>unexpected.</span>
        </h1>

        <p>Real conversations. New connections. One click away.</p>

        <button
          type="button"
          className="start-btn"
          onClick={startChatting}
        >
          <span className="start-icon">
            <Video size={23} />
            <Sparkles size={13} className="icon-sparkle" />
          </span>
          <span>START CHATTING</span>
          <ArrowUpRight size={21} />
        </button>

        <small>No complicated setup. Just start chatting.</small>
      </section>

      <section className="discovery">
        {modelsLoading ? (
          <p>Loading live models...</p>
        ) : modelsError && models.length === 0 ? (
          <div className="models-error">
            <p>Couldn't load live models. {modelsError}</p>
          </div>
        ) : models.length === 0 ? (
          <p>No models available right now.</p>
        ) : (
          <>
            {liveSections.slice(0, 2).map(renderLiveSection)}

            <div
              className={`extra-sections ${
                showMoreSections ? "expanded" : ""
              }`}
              aria-hidden={!showMoreSections}
              inert={!showMoreSections}
            >
              <div className="extra-sections-inner">
                {liveSections.slice(2).map(renderLiveSection)}
              </div>
            </div>

            <button
              type="button"
              className="view-more-btn"
              onClick={() => setShowMoreSections((value) => !value)}
              aria-expanded={showMoreSections}
            >
              <span>{showMoreSections ? "View Less" : "View More"}</span>
              <ChevronDown
                size={19}
                className={`view-more-arrow ${
                  showMoreSections ? "arrow-up" : ""
                }`}
              />
            </button>
          </>
        )}

        <div className="recorded-discovery">
          {videosLoading ? (
            <p>Loading videos...</p>
          ) : videos.length === 0 ? (
            <p>
              No videos could be displayed.
              {videosError ? ` ${videosError}` : ""}
            </p>
          ) : (
            <>
              {videoSections.slice(0, 2).map(renderVideoSection)}

              <div
                className={`extra-sections ${
                  showMoreVideoSections ? "expanded" : ""
                }`}
                aria-hidden={!showMoreVideoSections}
                inert={!showMoreVideoSections}
              >
                <div className="extra-sections-inner">
                  {videoSections.slice(2).map(renderVideoSection)}
                </div>
              </div>

              <button
                type="button"
                className="view-more-btn"
                onClick={() =>
                  setShowMoreVideoSections((value) => !value)
                }
                aria-expanded={showMoreVideoSections}
              >
                <span>
                  {showMoreVideoSections ? "View Less" : "View More"}
                </span>
                <ChevronDown
                  size={19}
                  className={`view-more-arrow ${
                    showMoreVideoSections ? "arrow-up" : ""
                  }`}
                />
              </button>
            </>
          )}
        </div>
      </section>

      <footer>
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>
        <p>Meet respectfully. Connect safely.</p>
      </footer>
    </main>
  );
}

