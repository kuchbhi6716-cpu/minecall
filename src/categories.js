
import {
  TrendingUp,
  Gamepad2,
  MessageCircle,
  Music2,
  Radio,
} from "lucide-react";

export const categories = [
  {
    id: "trending",
    title: "Trending creators",
    subtitle: "Creators people are discovering",
    icon: TrendingUp,
    color: "purple",
    cards: [
      { id: 1, title: "TheBurntPeanut", channel: "TheBurntPeanut", color: "purple", live: true },
      { id: 2, title: "CaseOh", channel: "caseoh_", color: "blue", live: true },
      { id: 3, title: "xQc", channel: "xQc", color: "pink", live: true },
      { id: 4, title: "KaiCenat", channel: "KaiCenat", color: "orange", live: true },
      { id: 5, title: "Stable Ronaldo", channel: "stableronaldo", color: "green", live: true },
    ],
  },
  {
    id: "gaming",
    title: "Gaming",
    subtitle: "Explore gaming communities",
    icon: Gamepad2,
    color: "blue",
    cards: [
      { id: 1, title: "Minecraft", channel: "Minecraft", color: "green" },
      { id: 2, title: "Competitive gaming", channel: "Competitive gaming", color: "purple" },
      { id: 3, title: "Variety games", channel: "Variety games", color: "pink" },
      { id: 4, title: "Adventure games", channel: "Adventure games", color: "orange" },
      { id: 5, title: "Gaming community", channel: "Gaming community", color: "blue" },
    ],
  },
  {
    id: "just-chatting",
    title: "Just chatting",
    subtitle: "Conversations, reactions and more",
    icon: MessageCircle,
    color: "pink",
    cards: [
      { id: 1, title: "Chill conversations", channel: "Chill conversations", color: "pink" },
      { id: 2, title: "React & discuss", channel: "React and discuss", color: "purple" },
      { id: 3, title: "Late night talks", channel: "Late night talks", color: "blue" },
      { id: 4, title: "Community time", channel: "Community time", color: "orange" },
      { id: 5, title: "Random topics", channel: "Random topics", color: "green" },
    ],
  },
  {
    id: "music",
    title: "Music",
    subtitle: "Music sessions and performances",
    icon: Music2,
    color: "orange",
    cards: [
      { id: 1, title: "Live music", channel: "Live music", color: "orange" },
      { id: 2, title: "Acoustic sessions", channel: "Acoustic sessions", color: "purple" },
      { id: 3, title: "DJ sessions", channel: "DJ sessions", color: "pink" },
      { id: 4, title: "Music discovery", channel: "Music discovery", color: "blue" },
      { id: 5, title: "Sing & play", channel: "Sing and play", color: "green" },
    ],
  },
  {
    id: "live-now",
    title: "Explore live",
    subtitle: "Discover live broadcasts",
    icon: Radio,
    color: "green",
    cards: [
      { id: 1, title: "TheBurntPeanut", channel: "TheBurntPeanut", color: "purple", live: true },
      { id: 2, title: "CaseOh", channel: "caseoh_", color: "blue", live: true },
      { id: 3, title: "xQc", channel: "xQc", color: "pink", live: true },
      { id: 4, title: "KaiCenat", channel: "KaiCenat", color: "orange", live: true },
      { id: 5, title: "Stable Ronaldo", channel: "stableronaldo", color: "green", live: true },
    ],
  },
];
