
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

const streams = [
  { id: 1, title: "TheBurntPeanut", channel: "TheBurntPeanut", color: "purple" },
  { id: 2, title: "CaseOh", channel: "caseoh_", color: "blue" },
  { id: 3, title: "xQc", channel: "xQc", color: "pink" },
  { id: 4, title: "KaiCenat", channel: "KaiCenat", color: "orange" },
  { id: 5, title: "Stable Ronaldo", channel: "stableronaldo", color: "green" },
];

const categories = [
  {
    id: "trending",
    title: "Trending creators",
    subtitle: "Creators people are discovering",
    icon: TrendingUp,
    color: "purple",
    cards: streams,
  },
  {
    id: "gaming",
    title: "Gaming",
    subtitle: "Jump into gaming communities",
    icon: Gamepad2,
    color: "blue",
    cards: [
      { id: 1, title: "Gaming", channel: "Gaming", color: "blue" },
      { id: 2, title: "Competitive", channel: "Competitive gaming", color: "purple" },
      { id: 3, title: "Minecraft", channel: "Minecraft", color: "green" },
      { id: 4, title: "Variety games", channel: "Variety gaming", color: "pink" },
      { id: 5, title: "Just gaming", channel: "Gaming streams", color: "orange" },
    ],
  },
  {
    id: "just-chatting",
    title: "Just chatting",
    subtitle: "Conversations, reactions and more",
    icon: MessageCircle,
    color: "pink",
    cards: [
      { id: 1, title: "Chill conversations", channel: "Just chatting", color: "pink" },
      { id: 2, title: "React & discuss", channel: "Reactions", color: "purple" },
      { id: 3, title: "Late night talks", channel: "Chatting", color: "blue" },
      { id: 4, title: "Community time", channel: "Community", color: "orange" },
      { id: 5, title: "Random topics", channel: "Discussion", color: "green" },
    ],
  },
  {
    id: "music",
    title: "Music",
    subtitle: "Music sessions and performances",
    icon: Music2,
    color: "orange",
    cards: [
      { id: 1, title: "Live music", channel: "Music", color: "orange" },
      { id: 2, title: "Acoustic sessions", channel: "Acoustic", color: "purple" },
      { id: 3, title: "DJ sessions", channel: "DJ", color: "pink" },
      { id: 4, title: "Music discovery", channel: "Music discovery", color: "blue" },
      { id: 5, title: "Sing & play", channel: "Live performance", color: "green" },
    ],
  },
  {
    id: "live-now",
    title: "Explore live",
    subtitle: "Find a stream to watch",
    icon: Radio,
    color: "green",
    cards: streams,
  },
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
        Explore <ArrowUpRight size={15} />
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
          minebbe<span>.</span>
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
          minebbe<span>.</span>
        </a>
        <p>Meet respectfully. Connect safely.</p>
      </footer>
    </main>
  );
}

