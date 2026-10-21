import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthPage from "./AuthPage.jsx";
import CreatorDashboard from "./CreatorDashboard.jsx";
import SubscriptionCreatorDashboard from "./SubscriptionCreatorDashboard.jsx";
import LivePage from "./LivePage.jsx";
import ExclusiveAccessPage from "./ExclusiveAccessPage.jsx";
import "./style.css";
import "./AuthPage.css";
import "./CreatorDashboard.css";
import "./SubscriptionCreatorDashboard.css";
import "./LivePage.css";
import "./ExclusiveAccessPage.css";

function RootApp() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/login") return <AuthPage />;
  if (path === "/signup") return <AuthPage initialMode="signup" />;
  if (path === "/creator") return <CreatorDashboard />;
  if (path === "/subscription-creator") return <SubscriptionCreatorDashboard />;
  if (path === "/exclusive-access") return <ExclusiveAccessPage />;
  if (path === "/subscription-live") return <LivePage />;
  if (path === "/live") return <LivePage />;
  return <App />;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><RootApp /></React.StrictMode>);
