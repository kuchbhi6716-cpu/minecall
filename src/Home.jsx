import { Video, ArrowUpRight, Sparkles } from "lucide-react";
import React from "react";
import "./Home.css";
import LivePage from "./LivePage";


const streams = [
  { id: 1, title: "TheBurntPeanut", color: "purple", channel: "TheBurntPeanut" },
  { id: 2, title: "CaseOh", color: "blue", channel: "caseoh_" },
  { id: 3, title: "xQc", color: "pink", channel: "xQc" },
  { id: 4, title: "KaiCenat", color: "orange", channel: "KaiCenat" },
  { id: 5, title: "Stable Ronaldo", color: "green", channel: "stableronaldo" },
];



export default function App() {
  const path = window.location.pathname;

  if (path === "/call" || path.startsWith("/call/")) {
    return <CallPage />;
  }

  if (path === "/live") {
    return <LivePage />;
  }

  return <Home />;
}


  return (
    <main className="minebbe">
      <nav className="navbar">
        <a className="logo" href="/">minebbe<span>.</span></a>
        <span className="online-status">● We're online</span>
      </nav>

      <section className="hero">
        <span className="eyebrow">YOUR NEXT CONVERSATION STARTS HERE</span>
        <h1>Meet someone<br /> <span>unexpected.</span></h1>
        <p>Real conversations. New connections. One click away.</p>

        
<button className="start-btn" onClick={startChatting}>
  <span className="start-icon">
    <Video size={23} />
    <Sparkles size={13} className="icon-sparkle" />
  </span>
  <span>START CHATTING</span>
  <ArrowUpRight size={21} />
</button>


        <small>No complicated setup. Just start chatting.</small>
      </section>

      <section className="streams">
        <div className="section-heading">
          <div>
            <h2>Explore live</h2>
            <p>Discover what's happening</p>
          </div>
          <span className="live-label">● LIVE PREVIEWS</span>
        </div>

        <div className="stream-grid">
          {streams.map((stream) => (
            <article
              className={`stream-card ${stream.color}`}
              key={stream.id}
            >
              <span className="stream-badge">DEMO</span>
              <div className="stream-info">
                <h3>{stream.title}</h3>
                <p>Preview room</p>
              </div>

              
<button
  className="join-btn"
  onClick={() => {
    window.location.href =
      "/live?channel=" + encodeURIComponent(stream.channel);
  }}
>
  Watch live <ArrowUpRight size={15} />
</button>


            </article>
          ))}
        </div>
      </section>

      <footer>
        <a className="logo" href="/">minebbe<span>.</span></a>
        <p>Meet respectfully. Connect safely.</p>
      </footer>
    </main>
  );
}
