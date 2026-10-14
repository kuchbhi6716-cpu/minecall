
import React from "react";
import { ArrowLeft, ExternalLink, Radio, Tv } from "lucide-react";
import "./LivePage.css";

const channels = {
  TheBurntPeanut: {
    name: "TheBurntPeanut",
    category: "Live gaming",
  },
  caseoh_: {
    name: "CaseOh",
    category: "Gaming & entertainment",
  },
  xQc: {
    name: "xQc",
    category: "Live entertainment",
  },
  KaiCenat: {
    name: "KaiCenat",
    category: "Live entertainment",
  },
  stableronaldo: {
    name: "Stable Ronaldo",
    category: "Live gaming",
  },
};

export default function LivePage() {
  const params = new URLSearchParams(window.location.search);
  const requestedChannel = params.get("channel");
  const channel = channels[requestedChannel]
    ? requestedChannel
    : "TheBurntPeanut";

  const stream = channels[channel];
  const parent = window.location.hostname;

  const embedUrl =
    "https://player.twitch.tv/?channel=" +
    encodeURIComponent(channel) +
    "&parent=" +
    encodeURIComponent(parent) +
    "&muted=true";

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
            <Tv size={15} /> LIVE CHANNEL
          </span>
          <h1>Watch <span>live.</span></h1>
          <p>Catch the moment as it happens.</p>
        </div>

        <article className="live-player-card">
          <div className="live-player">
            <iframe
              src={embedUrl}
              title={"Twitch live stream: " + stream.name}
              allowFullScreen
              allow="autoplay; fullscreen"
            />
          </div>

          <div className="live-details">
            <div className="live-avatar">
              {stream.name.charAt(0).toUpperCase()}
            </div>

            <div className="live-channel-info">
              <h2>{stream.name}</h2>
              <p>{stream.category}</p>
              <span className="live-note">
                Stream availability depends on the channel being live.
              </span>
            </div>

            <a
              className="live-open-twitch"
              href={"https://www.twitch.tv/" + channel}
              target="_blank"
              rel="noreferrer"
              aria-label="Open channel on Twitch"
            >
              <ExternalLink size={18} />
            </a>
          </div>
        </article>

        <section className="more-live">
          <h3>Explore channels</h3>
          <p>Choose another stream to watch.</p>

          <div className="channel-list">
            {Object.entries(channels).map(([id, item]) => (
              <a
                key={id}
                className={
                  id === channel
                    ? "channel-item selected"
                    : "channel-item"
                }
                href={"/live?channel=" + encodeURIComponent(id)}
              >
                <span className="channel-avatar">
                  {item.name.charAt(0).toUpperCase()}
                </span>
                <span className="channel-text">
                  <strong>{item.name}</strong>
                  <small>{item.category}</small>
                </span>
                <span className="channel-watch">Watch →</span>
              </a>
            ))}
          </div>
        </section>

        <footer className="live-footer">
          Fun of for by OnlyStream
        </footer>
      </section>
    </main>
  );
}
