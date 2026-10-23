import React, { useEffect, useRef, useState } from "react";
import {
  Video,
  ArrowUpRight,
  Sparkles,
  Radio,
  ChevronDown,
  ShieldCheck,
  LockKeyhole,
  RefreshCw,
  LogOut,
} from "lucide-react";
import "./Home.css";

const API_URL = "/api/aw-models";
const CREATORS_URL = "/api/live-creators";
const REFRESH_INTERVAL = 45000;
const CREATORS_REFRESH_INTERVAL = 5000;
const MISSING_REFRESH_LIMIT = 2;
const AGE_CONFIRMATION_KEY = "onlystream-age-confirmed-v1";
const SESSION_KEY = "onlystream-test-session-v1";

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

function isExplicitlyOffline(model) {
  const status = String(
    model?.status ??
      model?.availability ??
      model?.streamStatus ??
      model?.stream_status ??
      ""
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (
    model?.isOnline === false ||
    model?.is_online === false ||
    model?.online === false ||
    model?.isLive === false ||
    model?.is_live === false
  ) {
    return true;
  }

  return [
    "offline",
    "away",
    "disconnected",
    "not_live",
    "not-live",
  ].includes(status);
}

function normalizeModels(list) {
  const normalized = list
    .filter(
      (model) =>
        model &&
        typeof model === "object" &&
        getModelUsername(model) &&
        !isExplicitlyOffline(model)
    )
    .map((model) => {
      const rawAge = Number(
        model?.persons?.[0]?.age ?? model?.age ?? 0
      );

      return {
        ...model,
        username: getModelUsername(model),
        name: getModelName(model),
        thumbnail: getModelThumbnail(model),
        age: Number.isFinite(rawAge) && rawAge > 0 ? rawAge : 0,
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

function mergeModels(previous, incoming, missingCounts) {
  const incomingMap = new Map(
    incoming.map((model) => [
      model.username.toLowerCase(),
      model,
    ])
  );

  const previousKeys = new Set(
    previous.map((model) => model.username.toLowerCase())
  );

  const next = [];

  for (const oldModel of previous) {
    const key = oldModel.username.toLowerCase();
    const freshModel = incomingMap.get(key);

    if (freshModel) {
      missingCounts.delete(key);
      next.push({
        ...oldModel,
        ...freshModel,
        username: oldModel.username,
      });
    } else {
      const misses = (missingCounts.get(key) || 0) + 1;
      missingCounts.set(key, misses);

      if (misses < MISSING_REFRESH_LIMIT) {
        next.push(oldModel);
      } else {
        missingCounts.delete(key);
      }
    }
  }

  for (const model of incoming) {
    const key = model.username.toLowerCase();

    if (!previousKeys.has(key)) {
      next.push(model);
      missingCounts.delete(key);
    }
  }

  return next;
}

function AgeDisclaimer({ onConfirm }) {
  function leaveSite() {
    window.location.replace(
      "https://www.google.com/search?tbm=isch&q=cute+cat+pictures"
    );
  }

  return (
    <div className="age-gate-backdrop">
      <section
        className="age-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        aria-describedby="age-gate-description"
      >
        <div className="age-gate-brand">
          <span className="age-gate-brand-icon">
            <ShieldCheck size={24} />
          </span>
          <span>
            OnlyStream<span className="age-gate-dot">.</span>
          </span>
        </div>

        <div className="age-gate-symbol">
          <LockKeyhole size={31} />
        </div>

        <span className="age-gate-eyebrow">AGE VERIFICATION</span>

        <h2 id="age-gate-title">
          Before you
          <br />
          <span>step inside.</span>
        </h2>

        <p id="age-gate-description">
          This website may contain adult-oriented material.
          Please confirm that you are at least 18 years old
          and legally permitted to access this content in
          your location.
        </p>

        <div className="age-gate-notice">
          <ShieldCheck size={18} />
          <span>
            By continuing, you confirm that you meet the
            applicable age requirement.
          </span>
        </div>

        <button
          type="button"
          className="age-gate-confirm"
          onClick={onConfirm}
        >
          I AM 18 OR OLDER
          <ArrowUpRight size={19} />
        </button>

        <button
          type="button"
          className="age-gate-leave"
          onClick={leaveSite}
        >
          I'm under 18 — leave site
        </button>

        <small className="age-gate-footer">
          Please browse responsibly.
        </small>
      </section>
    </div>
  );
}

function ModelCard({ model }) {
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
            LIVE NOW
          </p>
        </div>
      </button>
    </article>
  );
}

function getCreatorPlan(creator) {
  const candidates = [
    creator?.creatorPlan,
    creator?.creator_plan,
    creator?.subscriptionPlan,
    creator?.subscription_plan,
    creator?.earningType,
    creator?.earning_type,
    creator?.monetizationType,
    creator?.monetization_type,
    creator?.plan,
    creator?.account?.creatorPlan,
    creator?.profile?.creatorPlan,
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (["subscription", "subscriber", "subscriptionbased", "subscriptioncreator", "lifetimeaccess"].includes(normalized)) {
      return "subscription";
    }
    if (["call", "paypercall", "callearnings", "paidcall"].includes(normalized)) {
      return "call";
    }
  }
  // Some older records store the plan as a boolean rather than a string.
  if (creator?.isSubscriptionCreator === true || creator?.is_subscription_creator === true || creator?.subscriptionEnabled === true || creator?.subscription_enabled === true) {
    return "subscription";
  }
  return "call";
}

function getSubscriptionHours(creator) {
  const raw = Number(creator?.subscriptionHours ?? creator?.subscription_hours ?? creator?.account?.subscriptionHours ?? creator?.profile?.subscriptionHours ?? 24);
  return [3, 5, 7, 24].includes(raw) ? raw : 24;
}

function getSubscriptionPrice(creator) {
  const raw = creator?.subscriptionPrice ?? creator?.subscription_price ?? creator?.subscriptionAmount ?? creator?.subscription_amount ?? creator?.price;
  const price = Number(raw);
  return Number.isFinite(price) && price > 0 ? price : 499;
}

function getCreatorCardImage(creator) {
  const possibleImages = [
    creator?.liveThumbnail,
    creator?.live_thumbnail,
    creator?.thumbnail,
    creator?.profileImage,
    creator?.profile_image,
    creator?.avatar,
    creator?.avatarUrl,
    creator?.avatar_url,
    creator?.imageUrl,
    creator?.image_url,
    creator?.photoURL,
    creator?.photoUrl,
    creator?.profile?.image,
    creator?.profile?.avatar,
  ];
  const suppliedImage = possibleImages.find(
    (value) => typeof value === "string" && value.trim()
  );
  if (suppliedImage) return normalizeImageUrl(suppliedImage);

  // Stable per-creator portrait fallback: it won't change every 5-second refresh.
  // A real profile/live thumbnail supplied by the backend always takes priority.
  const username = String(creator?.username || "creator").trim();
  return `https://i.pravatar.cc/600?u=${encodeURIComponent(username)}`;
}

function OnlyStreamCreatorCard({ creator, plan = "call" }) {
  const subscription = plan === "subscription";
  const [imageError, setImageError] = useState(false);
  const creatorImage = getCreatorCardImage(creator);

  useEffect(() => {
    setImageError(false);
  }, [creatorImage]);

  function openCreator() {
    if (subscription) {
      const price = getSubscriptionPrice(creator);
      const hours = getSubscriptionHours(creator);
      window.location.href = `/exclusive-access?creator=${encodeURIComponent(creator.username)}&price=${price}&hours=${hours}`;
    } else {
      window.location.href = "/call?creator=" + encodeURIComponent(creator.username);
    }
  }

  return (
    <article className={`stream-card model-card onlystream-creator-card ${subscription ? "subscription-creator-card" : "call-creator-card"}`}>
      <button type="button" className="model-card-click" onClick={openCreator} aria-label={`${subscription ? "View subscription creator" : "Call creator"} ${creator.username}`}>
        {!imageError && creatorImage ? (
          <img
            className="model-thumbnail onlystream-creator-avatar"
            src={creatorImage}
            alt={`${creator.username} creator photo`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="model-thumbnail model-thumbnail-fallback onlystream-creator-avatar"><Radio size={34} /></div>
        )}
        {subscription && <span className={`subscription-card-ribbon ${creator.isRented || creator.is_rented ? "subscription-card-rented" : ""}`}>{creator.isRented || creator.is_rented ? "RENTED" : `${getSubscriptionHours(creator)}H EXCLUSIVE`}</span>}
        <span className={`model-online ${(creator.isRented || creator.is_rented) ? "model-online-rented" : ""}`}>● {subscription ? ((creator.isRented || creator.is_rented) ? "RENTED" : "AVAILABLE") : (creator.isLive || creator.is_live ? "LIVE" : "AVAILABLE")}</span>
        <div className="stream-info"><h3>{creator.username}</h3><p>{subscription ? ((creator.isRented || creator.is_rented) ? `RENTED · ${getSubscriptionHours(creator)}-HOUR ACCESS` : `${getSubscriptionHours(creator)}-HOUR ACCESS · ₹${getSubscriptionPrice(creator)} ONCE`) : "CALL EARNING · PAY PER CALL"}</p></div>
      </button>
    </article>
  );
}

export default function Home() {
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [showMoreSections, setShowMoreSections] = useState(false);
  const [session, setSession] = useState(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(SESSION_KEY) || "null"
      );
      const normalizedRole = String(saved?.role || "").trim().toLowerCase();
      return saved && (normalizedRole === "user" || normalizedRole === "creator")
        ? { ...saved, role: normalizedRole }
        : null;
    } catch {
      return null;
    }
  });

  const [onlyStreamCreators, setOnlyStreamCreators] = useState([]);
  const [creatorsLoading, setCreatorsLoading] = useState(true);
  const [creatorsError, setCreatorsError] = useState("");

  const [ageConfirmed, setAgeConfirmed] = useState(() => {
    try {
      return (
        window.localStorage.getItem(AGE_CONFIRMATION_KEY) === "true"
      );
    } catch {
      return false;
    }
  });

  const missingCountsRef = useRef(new Map());

  useEffect(() => {
    let active = true;
    let requestInProgress = false;

    async function loadOnlyStreamCreators() {
      if (requestInProgress) return;
      requestInProgress = true;

      try {
        const response = await fetch(CREATORS_URL, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const creators = Array.isArray(data.creators)
          ? data.creators.filter(
              (creator) =>
                creator &&
                typeof creator.username === "string" &&
                creator.username.trim()
            )
          : [];

        if (active) {
          setOnlyStreamCreators(creators);
          setCreatorsError("");
        }
      } catch (error) {
        if (active) {
          setCreatorsError(
            error.message || "Could not load OnlyStream creators."
          );
        }
      } finally {
        requestInProgress = false;
        if (active) setCreatorsLoading(false);
      }
    }

    loadOnlyStreamCreators();

    const interval = window.setInterval(
      loadOnlyStreamCreators,
      CREATORS_REFRESH_INTERVAL
    );

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  function confirmAge() {
    try {
      window.localStorage.setItem(AGE_CONFIRMATION_KEY, "true");
    } catch {
      // Continue for the current session if storage is unavailable.
    }

    setAgeConfirmed(true);
  }

  useEffect(() => {
    if (ageConfirmed) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [ageConfirmed]);

  useEffect(() => {
    let active = true;
    let requestInProgress = false;

    async function loadModels() {
      if (requestInProgress) return;
      requestInProgress = true;

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

        setModels((previous) =>
          mergeModels(
            previous,
            normalized,
            missingCountsRef.current
          )
        );

        setModelsError(
          normalized.length
            ? ""
            : "No models found in the API response."
        );
      } catch (error) {
        if (active) {
          setModelsError(
            error.message || "Could not refresh live models."
          );
        }
      } finally {
        requestInProgress = false;
        if (active) setModelsLoading(false);
      }
    }

    loadModels();

    const interval = window.setInterval(
      loadModels,
      REFRESH_INTERVAL
    );

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const sectionSize = Math.ceil(models.length / 9);

  const sectionTitles = [
    {
      title: "Models Live Now",
      subtitle: "Discover who's online",
      color: "purple",
    },
    {
      title: "Trending Now",
      subtitle: "Live models to discover",
      color: "blue",
    },
    {
      title: "Popular Creators",
      subtitle: "More creators to discover",
      color: "pink",
    },
    {
      title: "Just For You",
      subtitle: "Discover more creators",
      color: "green",
    },
    {
      title: "Explore More",
      subtitle: "Keep discovering",
      color: "purple",
    },
    {
      title: "Recently Active",
      subtitle: "Discover more live creators",
      color: "blue",
    },
    {
      title: "Featured Creators",
      subtitle: "Find your next conversation",
      color: "pink",
    },
    {
      title: "More To Explore",
      subtitle: "Browse more live profiles",
      color: "green",
    },
    {
      title: "Around The Community",
      subtitle: "See who's available",
      color: "purple",
    },
  ];

  const liveSections = sectionTitles.map((section, index) => ({
    ...section,
    models: models.slice(
      index * sectionSize,
      index === sectionTitles.length - 1
        ? undefined
        : (index + 1) * sectionSize
    ),
  }));

  function startChatting() {
    window.location.href = "/call";
  }

  function openCreatorStudio() {
    // A normal user must never be sent into Creator Studio.
    if (session?.role === "user") return;

    if (session?.role === "creator") {
      // Subscription creators must open their own studio, not the pay-per-call dashboard.
      const destination = session.creatorPlan === "subscription"
        ? "/subscription-creator"
        : "/creator";
      window.location.href = destination;
      return;
    }

    // After login, AuthPage checks the creator plan and redirects subscription creators
    // to /subscription-creator while call creators go to /creator.
    window.location.href = "/login?next=%2Fcreator";
  }

  function logoutUser() {
    // Logout is only shown to normal user accounts.
    if (session?.role !== "user") return;

    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // Continue to the homepage even if browser storage is unavailable.
    }

    setSession(null);
    window.location.replace("/");
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
                key={model.username.toLowerCase()}
                model={model}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <main className="minebbe">
      {!ageConfirmed && (
        <AgeDisclaimer onConfirm={confirmAge} />
      )}

      <nav className="navbar">
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>

        <div className="home-nav-actions">
          <span className="online-status">● We're online</span>
          {session?.role === "user" ? (
            <button
              type="button"
              className="creator-studio-link"
              onClick={logoutUser}
            >
              Logout
              <LogOut size={15} />
            </button>
          ) : session?.role === "creator" ? (
            <button
              type="button"
              className="creator-studio-link"
              onClick={openCreatorStudio}
            >
              Creator Studio
              <ArrowUpRight size={15} />
            </button>
          ) : (
            <a className="creator-studio-link" href="/login">
              Login
            </a>
          )}
        </div>
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
      </section>

      <section className="discovery">
        {(() => {
          const subscriptionCreators = onlyStreamCreators.filter(c => getCreatorPlan(c) === "subscription");
          const creatorsForHours = hours => subscriptionCreators.filter(c => getSubscriptionHours(c) === hours);
          const callCreators = onlyStreamCreators.filter(c => getCreatorPlan(c) !== "subscription");
          const rentSections = [
            { hours: 3, title: "3 Hour Rent", label: "3-HOUR EXCLUSIVE RENT", description: "Exclusive access for 3 hours" },
            { hours: 5, title: "5 Hour Rent", label: "5-HOUR EXCLUSIVE RENT", description: "Exclusive access for 5 hours" },
            { hours: 7, title: "7 Hour Rent", label: "7-HOUR EXCLUSIVE RENT", description: "Exclusive access for 7 hours" },
          ];
          return <>
            {rentSections.map(({ hours, title, label, description }) => {
              const sectionCreators = creatorsForHours(hours);
              return <section key={hours} className={`category-section onlystream-live-section subscription-creators-section rent-${hours}-hour-section`}>
                <div className="category-heading"><div className="category-title-wrap"><span className="category-icon subscription-section-icon"><Radio size={19}/></span><div><span className="subscription-section-label">{label}</span><h2>{title}</h2><p>{description}</p></div></div><span className="online-status">● {sectionCreators.length} creators</span></div>
                {creatorsLoading ? <p>Loading subscription creators...</p> : sectionCreators.length ? <div className="category-track">{sectionCreators.map(creator => <OnlyStreamCreatorCard key={creator.username.toLowerCase()} creator={creator} plan="subscription" />)}</div> : <p className="creator-section-empty">No {hours}-hour rent creators available yet.</p>}
              </section>;
            })}
            <section className="category-section onlystream-live-section subscription-creators-section">
              <div className="category-heading"><div className="category-title-wrap"><span className="category-icon subscription-section-icon"><Radio size={19}/></span><div><span className="subscription-section-label">EXCLUSIVE ACCESS</span><h2>24 Hour Exclusive</h2><p>Pay once for 24-hour unlimited calls and chat without coins</p></div></div><span className="online-status">● {creatorsForHours(24).length} creators</span></div>
              {creatorsLoading ? <p>Loading subscription creators...</p> : creatorsForHours(24).length ? <div className="category-track">{creatorsForHours(24).map(creator => <OnlyStreamCreatorCard key={creator.username.toLowerCase()} creator={creator} plan="subscription" />)}</div> : <p className="creator-section-empty">No 24-hour exclusive creators available yet.</p>}
            </section>
            <section className="category-section onlystream-live-section call-creators-section">
              <div className="category-heading"><div className="category-title-wrap"><span className="category-icon pink"><Radio size={19}/></span><div><h2>Call Earning Creators</h2><p>Connect through the existing paid-call system</p></div></div><span className="online-status">● {callCreators.length} creators</span></div>
              {creatorsLoading ? <p>Checking live creators...</p> : callCreators.length ? <div className="category-track">{callCreators.map(creator => <OnlyStreamCreatorCard key={creator.username.toLowerCase()} creator={creator} plan="call" />)}</div> : <p className="creator-section-empty">No call creators live right now.</p>}
              {creatorsError && <p className="models-error">Creator list refresh failed temporarily. Showing the last result.</p>}
            </section>
          </>;
        })()}

        {modelsLoading ? (
          <p>Loading live models...</p>
        ) : modelsError && models.length === 0 ? (
          <div className="models-error">
            <p>Couldn't load live models. {modelsError}</p>
            <button
              type="button"
              className="creator-refresh-button"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={14} />
              Retry
            </button>
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
              onClick={() =>
                setShowMoreSections((value) => !value)
              }
              aria-expanded={showMoreSections}
            >
              <span>
                {showMoreSections ? "View Less" : "View More"}
              </span>

              <ChevronDown
                size={19}
                className={`view-more-arrow ${
                  showMoreSections ? "arrow-up" : ""
                }`}
              />
            </button>
          </>
        )}
      </section>

      <hr />

      <footer className="site-footer">
        <div className="footer-main">
          <a className="logo" href="/">
            OnlyStream<span>.</span>
          </a>

          <p className="footer-tagline">
            Meet respectfully. Connect safely.
          </p>
        </div>

        <div className="footer-about">
          <section className="footer-about-card">
            <h3>About OnlyStream</h3>
            <p>
              OnlyStream is a platform built to help people
              discover live creators and connect with others
              through online conversations.
            </p>
          </section>

          <section className="footer-about-card">
            <h3>About the Owner</h3>
            <p>
              OnlyStream is an independent online project.
              For questions, feedback, or business enquiries,
              feel free to get in touch.
            </p>
          </section>

          <section className="footer-about-card footer-contact">
            <h3>Contact</h3>
            <p>Have a question or suggestion?</p>

            <a href="mailto:kuchbhi6716@gmail.com">
              kuchbhi6716@gmail.com
              <ArrowUpRight size={16} />
            </a>
          </section>
        </div>

        <hr />

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} OnlyStream</span>
          <span>Meet & Connect safely.</span>
        </div>
      </footer>
    </main>
  );
}
