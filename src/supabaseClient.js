import { createClient } from "@supabase/supabase-js";

const supabaseUrlRaw = import.meta.env.VITE_SUPABASE_URL;
const supabaseUrl = typeof supabaseUrlRaw === "string"
  ? supabaseUrlRaw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "")
  : "";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY environment variables.");
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabasePublishableKey || "missing-publishable-key",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
