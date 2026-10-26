
import { supabase } from "./supabaseClient";

/** Load the signed-in account from Supabase Auth + profiles; never browser storage. */
export async function loadSupabaseAccount() {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  let session = authData?.session;
  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data?.session;
  }
  const user = session?.user;
  if (!user?.id || !session?.access_token) return null;
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,username,role,gender,creator_plan,subscription_price,subscription_hours")
    .eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!profile) return null;
  return {
    id: user.id,
    email: user.email || "",
    username: profile.username || user.email?.split("@")[0] || "user",
    role: profile.role || "user",
    gender: profile.gender || "",
    creatorPlan: profile.creator_plan || "calls",
    subscriptionPrice: Number(profile.subscription_price || 0),
    subscriptionHours: Number(profile.subscription_hours || 24),
    accessToken: session.access_token,
  };
}
