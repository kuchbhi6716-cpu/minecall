
import React from "react";
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
} from "lucide-react";
import "./Home.css";
import { categories } from "./categories";

const streams = [
  { id: 1, title: "TheBurntPeanut", channel: "TheBurntPeanut", color: "purple" },
  { id: 2, title: "CaseOh", channel: "caseoh_", color: "blue" },
  { id: 3, title: "xQc", channel: "xQc", color: "pink" },
  { id: 4, title: "KaiCenat", channel: "KaiCenat", color: "orange" },
  { id: 5, title: "Stable Ronaldo", channel: "stableronaldo", color: "green" },
];



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

      {/* Category carousels */}
      <section className="discovery">
        {categories.map((category) => {
          const Icon = category.icon;

          return (
            <section
              className="category-section"
              key={category.id}
            >
              <div className="category-heading">
                <div className="category-title-wrap">
                  <span className={`category-icon ${category.color}`}>
                    <Icon size={19} />
                  </span>

                  <div>
                    <h2>{category.title}</h2>
                    <p>{category.subtitle}</p>
                  </div>
                </div>

                <button
                  className="view-more-btn"
                  onClick={() => {
                    window.location.href =
                      `/category/${category.id}`;
                  }}
                  aria-label={`View more ${category.title}`}
                >
                  <span>View more</span>
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="category-track">
                {category.cards.map((stream) => (
                  <StreamCard
                    key={`${category.id}-${stream.id}`}
                    stream={stream}
                  />
                ))}
              </div>
            </section>
          );
        })}
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

