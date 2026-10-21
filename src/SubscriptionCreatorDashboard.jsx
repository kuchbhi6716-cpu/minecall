import React from "react";
import CreatorDashboard from "./CreatorDashboard.jsx";

// Exclusive creators use the same camera, call, chat, and earnings dashboard UI
// as pay-per-call creators. The mode changes only monetization and access rules.
export default function SubscriptionCreatorDashboard() {
  return <CreatorDashboard exclusiveMode />;
}
