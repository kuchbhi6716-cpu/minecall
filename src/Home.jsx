import React, { useEffect, useState } from "react";
import {
  Video,
  ArrowUpRight,
  Sparkles,
  ChevronRight,
  Gamepad2,
  Music2,
  MessageCircle,
  Radio,
  TrendingUp,
  Heart,
} from "lucide-react";
import "./Home.css";



function ModelCard({ model }) {
  return (
    <article className="stream-card model-card">
      <button
        className="model-card-click"
        onClick={() => {
          window.location.href =
            "/live?model=" + encodeURIComponent(model.username);
        }}
        aria-label={`Watch ${model.name}`}
      >
        <img
          className="model-thumbnail"
          src={model.thumbnail}
          alt=""
          loading="lazy"
        />

        <span className="model-online">● LIVE</span>

        <div className="stream-info">
          <h3>{model.name}</h3>
          <p>
            {model.age ? `${model.age}+ · ` : ""}
            Online now
          </p>
        </div>
      </button>
    </article>
  );
}


function openLive(channel) {
  window.location.href =
    "/live?channel=" + encodeURIComponent(channel);
}

function StreamCard({ stream }) {
  return (
    <article
      className={`stream-card ${stream.color} category-card`}
      key={stream.id}
    >
      <span className="stream-badge">EXPLORE</span>

      <div className="stream-info">
        <h3>{stream.title}</h3>
        <p>{stream.channel}</p>
      </div>

      <button
        className="join-btn"
        onClick={() => openLive(stream.channel)}
      >
        Watch <ArrowUpRight size={15} />
      </button>
    </article>
  );
}

export default function Home() {
  
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadModels() {
      try {
        const response = await fetch("/api/models-online");

        if (!response.ok) {
          throw new Error("Could not load models");
        }

        const data = await response.json();

        if (active) {
          setModels(Array.isArray(data.models) ? data.models : []);
          setModelsError(false);
          setModelsLoading(false);
        }
      } catch {
        if (active) {
          setModelsError(true);
          setModelsLoading(false);
        }
      }
    }

    loadModels();

    const interval = setInterval(loadModels, 45000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const startChatting = () => {
    window.location.href = "/call";
  };

  return (
    <main className="minebbe">
      <nav className="navbar">
        <a className="logo" href="/">
          OnlyStream<span>.</span>
        </a>
        <span className="online-status">● We're online</span>
      </nav>

      {/* Existing hero — kept in place */}
      <section className="hero">
        <span className="eyebrow">
          YOUR NEXT CONVERSATION STARTS HERE
        </span>

        <h1>
          Meet someone
          <br />
          <span>unexpected.</span>
        </h1>

        <p>
          Real conversations. New connections. One click away.
        </p>

        <button className="start-btn" onClick={startChatting}>
          <span className="start-icon">
            <Video size={23} />
            <Sparkles size={13} className="icon-sparkle" />
          </span>

          <span>START CHATTING</span>
          <ArrowUpRight size={21} />
        </button>

        <small>
          No complicated setup. Just start chatting.
        </small>
      </section>

      
      {/* Live BongaCams models */}
      <section className="discovery live-models-section">
        <div className="category-heading">
          <div className="category-title-wrap">
            <span className="category-icon purple">
              <Radio size={19} />
            </span>
            <div>
              <h2>Models Live Now</h2>
              <p>Discover who's online</p>
            </div>
          </div>
          <span className="online-status">
            ● {models.length} online
          </span>
        </div>

        {modelsLoading ? (
          <p>Loading live models...</p>
        ) : modelsError ? (
          <p>Couldn't load live models. Please try again later.</p>
        ) : models.length === 0 ? (
          <p>No models are available right now.</p>
        ) : (
          <div className="category-track">
            {models.map((model) => (
              <ModelCard key={model.username} model={model} />
            ))}
          </div>
        )}
      </section>

        {/* Category carousels */}
  <section className="discovery">
    {/* Section 1: Trending Now */}
    <section className="category-section">
      <div className="category-heading">
        <div className="category-title-wrap">
          <span className="category-icon purple">
            <TrendingUp size={19} />
          </span>
          <div>
            <h2>Trending Now</h2>
            <p>What's popular right now</p>
          </div>
        </div>
      </div>
      <div className="category-track">
        {[
          { id: 1, title: "Trending Creator", channel: "Discover", color: "purple" },
          { id: 2, title: "Popular Stream", channel: "Explore", color: "pink" },
          { id: 3, title: "Live Spotlight", channel: "Featured", color: "orange" },
          { id: 4, title: "Hot Pick", channel: "Trending", color: "blue" },
        ].map((stream) => (
          <StreamCard key={stream.id} stream={stream} />
        ))}
      </div>
    </section>
    {/* Section 2: Popular Creators */}
    <section className="category-section">
      <div className="category-heading">
        <div className="category-title-wrap">
          <span className="category-icon blue">
            <Sparkles size={19} />
          </span>
          <div>
            <h2>Popular Creators</h2>
            <p>Creators worth checking out</p>
          </div>
        </div>
      </div>
      <div className="category-track">
        {[
          { id: 5, title: "Creator One", channel: "Popular", color: "blue" },
          { id: 6, title: "Creator Two", channel: "Featured", color: "purple" },
          { id: 7, title: "Creator Three", channel: "Discover", color: "green" },
          { id: 8, title: "Creator Four", channel: "Popular", color: "pink" },
        ].map((stream) => (
          <StreamCard key={stream.id} stream={stream} />
        ))}
      </div>
    </section>
    {/* Section 3: Just For You */}
    <section className="category-section">
      <div className="category-heading">
        <div className="category-title-wrap">
          <span className="category-icon pink">
            <Heart size={19} />
          </span>
          <div>
            <h2>Just For You</h2>
            <p>A little something to explore</p>
          </div>
        </div>
      </div>
      <div className="category-track">
        {[
          { id: 9, title: "Your Next Pick", channel: "Recommended", color: "pink" },
          { id: 10, title: "New Discovery", channel: "Explore", color: "purple" },
          { id: 11, title: "Something Different", channel: "Discover", color: "orange" },
          { id: 12, title: "Surprise Stream", channel: "For You", color: "blue" },
        ].map((stream) => (
          <StreamCard key={stream.id} stream={stream} />
        ))}
      </div>
    </section>
    {/* Section 4: Explore More */}
    <section className="category-section">
      <div className="category-heading">
        <div className="category-title-wrap">
          <span className="category-icon green">
            <Radio size={19} />
          </span>
          <div>
            <h2>Explore More</h2>
            <p>Find something new</p>
          </div>
        </div>
      </div>
      <div className="category-track">
        {[
          { id: 13, title: "Fresh Finds", channel: "Explore", color: "green" },
          { id: 14, title: "Featured Live", channel: "Featured", color: "orange" },
          { id: 15, title: "Around the World", channel: "Discover", color: "blue" },
          { id: 16, title: "More to Explore", channel: "Live", color: "purple" },
        ].map((stream) => (
          <StreamCard key={stream.id} stream={stream} />
        ))}
      </div>
    </section>
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

