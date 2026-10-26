import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, LoaderCircle, Save, UserRound, X } from "lucide-react";
import { supabase } from "./supabaseClient";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function extensionFor(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

export default function ProfileSetupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("user");
  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [profileFile, setProfileFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [profilePreview, setProfilePreview] = useState("");
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const profileInput = useRef(null);
  const thumbnailInput = useRef(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError) {
        if (active) { setError(authError.message); setLoading(false); }
        return;
      }
      const currentUser = authData?.session?.user;
      if (!currentUser) {
        window.location.replace("/login?next=%2Fprofile-setup");
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, role, age, profile_picture_url, creator_thumbnail_url, profile_completed")
        .eq("id", currentUser.id)
        .maybeSingle();
      if (!active) return;
      if (profileError) {
        setError(`Could not load your Supabase profile: ${profileError.message}. Run the profile setup SQL migration first.`);
        setLoading(false);
        return;
      }
      setUser(currentUser);
      setRole(profile?.role || currentUser.user_metadata?.role || "user");
      setUsername(profile?.username || currentUser.user_metadata?.username || "");
      setAge(profile?.age ? String(profile.age) : "");
      setProfileUrl(profile?.profile_picture_url || "");
      setThumbnailUrl(profile?.creator_thumbnail_url || "");
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!profileFile) { setProfilePreview(""); return; }
    const url = URL.createObjectURL(profileFile);
    setProfilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [profileFile]);

  useEffect(() => {
    if (!thumbnailFile) { setThumbnailPreview(""); return; }
    const url = URL.createObjectURL(thumbnailFile);
    setThumbnailPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnailFile]);

  function validateImage(file) {
    if (!file) return "";
    if (!file.type?.startsWith("image/")) return "Please choose an image file.";
    if (file.size > MAX_IMAGE_BYTES) return "Each image must be 8 MB or smaller.";
    return "";
  }

  async function uploadImage(file, kind) {
    if (!file) return kind === "profile" ? profileUrl : thumbnailUrl;
    const validation = validateImage(file);
    if (validation) throw new Error(validation);
    const ext = extensionFor(file);
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-media")
      .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}. Check the profile-media bucket policies.`);
    const { data } = supabase.storage.from("profile-media").getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("Supabase uploaded the image but did not return a public URL.");
    return data.publicUrl;
  }

  async function handleSave(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const cleanUsername = username.trim().replace(/^@+/, "");
    const numericAge = Number(age);
    if (cleanUsername.length < 3 || cleanUsername.length > 24 || !/^[a-zA-Z0-9_.]+$/.test(cleanUsername)) {
      setError("Username must be 3–24 characters and use only letters, numbers, dots, or underscores.");
      return;
    }
    if (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 100) {
      setError("Only adults aged 18 or above can use OnlyStream. Enter a valid age.");
      return;
    }
    if (!profileUrl && !profileFile) {
      setError("Please upload a profile picture to continue.");
      return;
    }
    if (profileFile && validateImage(profileFile)) { setError(validateImage(profileFile)); return; }
    if (thumbnailFile && validateImage(thumbnailFile)) { setError(validateImage(thumbnailFile)); return; }

    setSaving(true);
    try {
      const finalProfileUrl = await uploadImage(profileFile, "profile");
      const finalThumbnailUrl = role === "creator" ? await uploadImage(thumbnailFile, "thumbnail") : null;
      const patch = {
        username: cleanUsername,
        age: numericAge,
        profile_picture_url: finalProfileUrl,
        profile_completed: true,
        updated_at: new Date().toISOString(),
      };
      if (role === "creator") patch.creator_thumbnail_url = finalThumbnailUrl || thumbnailUrl || null;

      const { data: savedProfile, error: updateError } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id)
        .select("id, role, username, age, profile_picture_url, profile_completed")
        .maybeSingle();

      if (updateError) {
        throw new Error(`Could not save profile to Supabase: ${updateError.message}`);
      }
      if (!savedProfile) {
        throw new Error(
          "Your profile was not updated in Supabase. Check that your profiles row exists and its UPDATE policy allows the signed-in user to update their own row."
        );
      }
      if (
        savedProfile.profile_completed !== true ||
        !savedProfile.username ||
        !savedProfile.age ||
        !savedProfile.profile_picture_url
      ) {
        throw new Error(
          "Supabase did not confirm that your profile was completed. Please try saving again."
        );
      }

      setProfileUrl(finalProfileUrl);
      if (role === "creator") setThumbnailUrl(finalThumbnailUrl || thumbnailUrl);
      setProfileFile(null);
      setThumbnailFile(null);
      setMessage("Profile saved to Supabase successfully.");
      // Prevent profile completion from redirecting back into login/setup.
      // Creators always return to the homepage after completing their profile.
      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext = Boolean(
        next &&
        next.startsWith("/") &&
        !next.startsWith("//") &&
        !next.includes("\\\\") &&
        !/^\/(?:login|signup|profile|profile-setup)(?:[/?#]|$)/i.test(next)
      );
      const destination = role !== "creator" && safeNext ? next : "/";
      window.setTimeout(() => window.location.replace(destination), 350);
    } catch (saveError) {
      setError(saveError?.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="profile-setup-page"><div className="profile-setup-loading"><LoaderCircle className="profile-spin" /> Loading your profile…</div></main>;

  return (
    <main className="profile-setup-page">
      <div className="profile-setup-orb profile-orb-one" />
      <div className="profile-setup-orb profile-orb-two" />
      <header className="profile-setup-header">
        <a className="profile-setup-brand" href="/">OnlyStream<span>.</span></a>
        <a className="profile-back-link" href="/"><ArrowLeft size={16} /> Home</a>
      </header>
      <section className="profile-setup-card">
        <div className="profile-setup-kicker"><span /> YOUR SPACE, YOUR IDENTITY</div>
        <h1>{"Complete your profile"}</h1>
        <p className="profile-setup-intro">Add your picture and username so people can recognise you on OnlyStream. Your details are saved to your Supabase profile.</p>
        <form onSubmit={handleSave} className="profile-setup-form">
          <div className="profile-picture-row">
            <button type="button" className="profile-picture-picker" onClick={() => profileInput.current?.click()} aria-label="Upload profile picture">
              {(profilePreview || profileUrl) ? <img src={profilePreview || profileUrl} alt="Profile preview" /> : <UserRound size={34} />}
              <span className="profile-camera-badge"><Camera size={15} /></span>
            </button>
            <div><strong>Profile picture <em>Required</em></strong><p>Square photo works best · JPG, PNG or WebP · max 8 MB</p><button type="button" className="profile-text-button" onClick={() => profileInput.current?.click()}>{profileFile || profileUrl ? "Change picture" : "Upload picture"}</button></div>
            <input ref={profileInput} type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; if (file) { setError(""); setProfileFile(file); } e.target.value = ""; }} />
          </div>
          <label className="profile-field"><span>Username</span><input value={username} onChange={e => setUsername(e.target.value)} minLength={3} maxLength={24} autoComplete="nickname" placeholder="e.g. alex_01" required /><small>This name is shown on your profile and creator cards.</small></label>
          <label className="profile-field"><span>Age</span><input type="number" min="18" max="100" value={age} onChange={e => setAge(e.target.value)} placeholder="18+" required /><small>Only users aged 18 or above may use OnlyStream.</small></label>
          {role === "creator" && <div className="creator-thumbnail-panel"><div className="creator-thumbnail-heading"><div><span className="creator-thumbnail-eyebrow">CREATOR PROFILE</span><h2>Creator thumbnail</h2><p>This image is used on your creator card on the homepage. If you skip it, your profile picture will be used.</p></div><span className="thumbnail-camera-icon"><Camera size={19} /></span></div><button type="button" className="creator-thumbnail-picker" onClick={() => thumbnailInput.current?.click()}>{(thumbnailPreview || thumbnailUrl) ? <img src={thumbnailPreview || thumbnailUrl} alt="Creator thumbnail preview" /> : <div className="thumbnail-placeholder"><Camera size={24} /><span>Upload creator thumbnail</span><small>Wide image recommended · max 8 MB</small></div>}</button><input ref={thumbnailInput} type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; if (file) { setError(""); setThumbnailFile(file); } e.target.value = ""; }} /><button type="button" className="profile-text-button" onClick={() => thumbnailInput.current?.click()}>{thumbnailFile || thumbnailUrl ? "Change thumbnail" : "Choose thumbnail"}</button></div>}
          {error && <div className="profile-form-message profile-error"><X size={16} /> {error}</div>}
          {message && <div className="profile-form-message profile-success"><CheckCircle2 size={16} /> {message}</div>}
          <button type="submit" className="profile-save-button" disabled={saving}>{saving ? <><LoaderCircle className="profile-spin" size={18} /> Saving profile…</> : <><Save size={17} /> Save profile</>}</button>
        </form>
        <p className="profile-privacy-note">Your profile details are stored in your OnlyStream Supabase database. Your images are stored in Supabase Storage.</p>
      </section>
    </main>
  );
}
