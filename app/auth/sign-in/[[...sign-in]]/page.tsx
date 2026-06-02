"use client";
import { useState, useEffect } from "react";
import { useSignIn, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ACCENT = "#7C3AED";
const ACCENT_GLOW = "rgba(124,58,237,0.4)";

export default function SignInPage() {
  const { signIn, isLoaded, setActive } = useSignIn();
  const { isSignedIn }       = useAuth();
  const router               = useRouter();

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  // Forgot password flow
  const [forgotMode,        setForgotMode]        = useState(false);
  const [resetStep,         setResetStep]         = useState<"email"|"code"|"password">("email");
  const [resetCode,         setResetCode]         = useState("");
  const [newPassword,       setNewPassword]       = useState("");
  const [confirmPassword,   setConfirmPassword]   = useState("");
  const [showNewPassword,   setShowNewPassword]   = useState(false);
  const [showConfirmPass,   setShowConfirmPass]   = useState(false);

  useEffect(() => {
    if (isSignedIn) router.replace("/dashboard");
  }, [isSignedIn, router]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="w-full max-w-md flex items-center justify-center py-20">
        <div className="flex gap-2">
          {[0,1,2].map(i => (
            <div key={i} className="dot w-3 h-3 rounded-full" style={{ background: ACCENT }}/>
          ))}
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || isSignedIn) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({
          session: result.createdSessionId,
          beforeEmit: () => router.replace("/dashboard"),
        });
      }
    } catch (err: unknown) {
      const clerkError = (err as { errors?: { message: string }[] })?.errors?.[0];
      setError(clerkError?.message ?? "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!isLoaded || isSignedIn) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy:            "oauth_google",
        redirectUrl:         "/auth/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err: unknown) {
      const clerkError = (err as { errors?: { message: string }[] })?.errors?.[0];
      setError(clerkError?.message ?? "Google sign-in failed.");
    }
  };

  // Step 1: send reset code
  const handleForgotEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true); setError("");
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email });
      setResetStep("code");
    } catch (err: unknown) {
      const clerkError = (err as { errors?: { message: string }[] })?.errors?.[0];
      setError(clerkError?.message ?? "Could not send reset email. Please check the address and try again.");
    } finally { setLoading(false); }
  };

  // Step 2: verify code with Clerk — no password submitted yet
  const handleForgotCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setError("Please enter the 6-digit code sent to your email.");
      return;
    }
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: resetCode.trim(),
      } as Parameters<typeof signIn.attemptFirstFactor>[0]);
      if ((result.status as string) === "needs_new_password") {
        setResetStep("password"); // code verified — advance
      } else if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/dashboard");
      }
    } catch {
      setResetCode("");
      setError("Invalid verification number.");
    } finally { setLoading(false); }
  };

  // Step 3: set new password via signIn.resetPassword (code already verified)
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    const letters  = (newPassword.match(/[a-zA-Z]/g) || []).length;
    const capitals = (newPassword.match(/[A-Z]/g)    || []).length;
    const symbols  = (newPassword.match(/[^a-zA-Z0-9]/g) || []).length;
    const numbers  = (newPassword.match(/[0-9]/g)    || []).length;
    if (letters < 4)  { setError("Password must have at least 4 letters."); return; }
    if (capitals < 1) { setError("Password must have at least 1 capital letter."); return; }
    if (symbols < 1)  { setError("Password must have at least 1 symbol (e.g. !@#$)."); return; }
    if (numbers < 3)  { setError("Password must have at least 3 numbers."); return; }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (signIn as any).resetPassword({ password: newPassword });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/dashboard");
      }
    } catch (err: unknown) {
      const clerkError = (err as { errors?: { message: string }[] })?.errors?.[0];
      setError(clerkError?.message ?? "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div className="w-full max-w-md">
      <style>{`
        .auth-input { transition: background-color 9999s ease-out, color 9999s ease-out; }
        .auth-input:-webkit-autofill,
        .auth-input:-webkit-autofill:hover,
        .auth-input:-webkit-autofill:focus {
          -webkit-text-fill-color: rgba(26,26,46,0.65) !important;
          caret-color: rgba(26,26,46,0.65);
        }
      `}</style>
      {/* Light glass card — matches hub leaderboard panel style */}
      <div className="rounded-3xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.75)",
          boxShadow: "0 8px 48px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset",
        }}>
        {/* Accent stripe */}
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)` }}/>

        <div className="px-8 pt-7 pb-8">
          {/* Header */}
          <div className="mb-7">
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(26,26,46,0.6)" }}>
              AI Decoder Academy
            </div>
            <h1 className="font-display font-black text-2xl mb-1.5" style={{ color: "#1a1a2e" }}>
              Welcome back! 🚀
            </h1>
            <p className="text-sm" style={{ color: "rgba(26,26,46,0.7)" }}>
              Your arenas are waiting. Ready for your next session?
            </p>
          </div>

          {/* ── Forgot password: step 1 — email ── */}
          {forgotMode && resetStep === "email" && (
            <form onSubmit={handleForgotEmail} className="space-y-4">
              <button type="button" onClick={() => { setForgotMode(false); setResetStep("email"); setError(""); }}
                className="text-xs font-semibold flex items-center gap-1 hover:underline"
                style={{ color: ACCENT }}>← Back to sign in</button>
              <h2 className="font-display font-black text-lg" style={{ color: "#1a1a2e" }}>Reset your password</h2>
              <p className="text-xs" style={{ color: "rgba(26,26,46,0.7)" }}>We'll email you a 6-digit code to reset your password.</p>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="username@gmail.com" required autoComplete="email"
                style={{ background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.1)", color:"rgba(26,26,46,0.65)" }}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)]" />
              {error && <p className="text-xs px-3 py-2.5 rounded-xl" style={{ background:"rgba(255,45,120,0.08)", border:"1px solid rgba(255,45,120,0.2)", color:"#e0185a" }}>{error}</p>}
              <button type="submit" disabled={loading || !email}
                className="w-full font-display font-black py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 24px ${ACCENT_GLOW}` }}>
                {loading ? "Sending…" : "Send reset code →"}
              </button>
            </form>
          )}

          {/* ── Forgot password: step 2 — verify code ── */}
          {forgotMode && resetStep === "code" && (
            <form onSubmit={handleForgotCode} className="space-y-4">
              <button type="button" onClick={() => { setResetStep("email"); setError(""); }}
                className="text-xs font-semibold flex items-center gap-1 hover:underline"
                style={{ color: ACCENT }}>← Change email</button>
              <h2 className="font-display font-black text-lg" style={{ color: "#1a1a2e" }}>Enter the code</h2>
              <p className="text-xs" style={{ color: "rgba(26,26,46,0.7)" }}>
                We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
              </p>
              <input type="text" value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, "").slice(0,6))}
                placeholder="123456" required maxLength={6} inputMode="numeric"
                style={{ background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.12)", color:"#1a1a2e", letterSpacing:"0.3em", textAlign:"center", fontSize:"1.25rem" }}
                className="w-full px-4 py-3 rounded-xl outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)]" />
              {error && <p className="text-xs px-3 py-2.5 rounded-xl" style={{ background:"rgba(255,45,120,0.08)", border:"1px solid rgba(255,45,120,0.2)", color:"#e0185a" }}>{error}</p>}
              <button type="submit" disabled={loading || resetCode.length !== 6}
                className="w-full font-display font-black py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 24px ${ACCENT_GLOW}` }}>
                {loading ? "Verifying…" : "Verify Code →"}
              </button>
            </form>
          )}

          {/* ── Forgot password: step 3 — new password ── */}
          {forgotMode && resetStep === "password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <button type="button" onClick={() => { setResetStep("code"); setError(""); }}
                className="text-xs font-semibold flex items-center gap-1 hover:underline"
                style={{ color: ACCENT }}>← Back to code</button>
              <h2 className="font-display font-black text-lg" style={{ color: "#1a1a2e" }}>Set new password</h2>
              {/* Live password requirements */}
              {(() => {
                const l = (newPassword.match(/[a-zA-Z]/g)||[]).length;
                const c = (newPassword.match(/[A-Z]/g)||[]).length;
                const s = (newPassword.match(/[^a-zA-Z0-9]/g)||[]).length;
                const n = (newPassword.match(/[0-9]/g)||[]).length;
                const req = [
                  { label: "At least 4 letters",        ok: l >= 4 },
                  { label: "At least 1 capital letter",  ok: c >= 1 },
                  { label: "At least 1 symbol (!@#…)",   ok: s >= 1 },
                  { label: "At least 3 numbers",         ok: n >= 3 },
                ];
                return (
                  <ul className="space-y-1">
                    {req.map(r => (
                      <li key={r.label} className="flex items-center gap-1.5 text-[13px] font-medium"
                        style={{ color: r.ok ? "#16a34a" : "#555e7a" }}>
                        <span>{r.ok ? "✓" : "○"}</span> {r.label}
                      </li>
                    ))}
                  </ul>
                );
              })()}
              {/* New password */}
              <div className="relative">
                <input type={showNewPassword ? "text" : "password"} value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password" required minLength={8}
                  style={{ background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.1)", color:"rgba(26,26,46,0.65)" }}
                  className="w-full pl-4 pr-10 py-3 rounded-xl text-sm outline-none placeholder:text-black/20 focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)]" />
                <button type="button" onClick={() => setShowNewPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color:"rgba(26,26,46,0.6)" }}>
                  {showNewPassword
                    ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.5"/><path d="M10 8a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" strokeWidth="1.5"/><path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>}
                </button>
              </div>
              {/* Confirm password */}
              <div className="relative">
                <input type={showConfirmPass ? "text" : "password"} value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password" required minLength={8}
                  style={{ background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.1)", color:"rgba(26,26,46,0.65)" }}
                  className="w-full pl-4 pr-10 py-3 rounded-xl text-sm outline-none placeholder:text-black/20 focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)]" />
                <button type="button" onClick={() => setShowConfirmPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color:"rgba(26,26,46,0.6)" }}>
                  {showConfirmPass
                    ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.5"/><path d="M10 8a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" strokeWidth="1.5"/><path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>}
                </button>
              </div>
              {/* Live match indicator */}
              {confirmPassword && (
                <p className="text-xs font-semibold" style={{ color: newPassword === confirmPassword ? "#16a34a" : "#e0185a" }}>
                  {newPassword === confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
                </p>
              )}
              {error && <p className="text-xs px-3 py-2.5 rounded-xl" style={{ background:"rgba(255,45,120,0.08)", border:"1px solid rgba(255,45,120,0.2)", color:"#e0185a" }}>{error}</p>}
              <button type="submit" disabled={loading || newPassword !== confirmPassword ||
                (newPassword.match(/[a-zA-Z]/g)||[]).length < 4 ||
                (newPassword.match(/[A-Z]/g)||[]).length < 1 ||
                (newPassword.match(/[^a-zA-Z0-9]/g)||[]).length < 1 ||
                (newPassword.match(/[0-9]/g)||[]).length < 3}
                className="w-full font-display font-black py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 24px ${ACCENT_GLOW}` }}>
                {loading ? "Saving…" : "Set new password →"}
              </button>
            </form>
          )}

          {!forgotMode && <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.65)" }}>
                Email
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(26,26,46,0.35)" }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M1 6l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <input
                  type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@school.com"
                  required autoComplete="email"
                  style={{ background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.1)", color:"rgba(26,26,46,0.65)" }}
                  className="auth-input w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all outline-none placeholder:text-black/25
                    focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.65)" }}>
                  Password
                </label>
                <button type="button" onClick={() => { setForgotMode(true); setError(""); }}
                  className="text-xs font-semibold hover:underline" style={{ color: ACCENT }}>
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(26,26,46,0.35)" }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <input
                  type={showPassword ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required autoComplete="current-password"
                  style={{ background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.1)", color:"rgba(26,26,46,0.65)" }}
                  className="auth-input w-full pl-10 pr-10 py-3 rounded-xl text-sm transition-all outline-none placeholder:text-black/25
                    focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)]"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "rgba(26,26,46,0.35)" }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(255,45,120,0.08)", border: "1px solid rgba(255,45,120,0.2)", color: "#e0185a" }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || !email || !password}
              className="w-full font-display font-black py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed mt-1"
              style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 24px ${ACCENT_GLOW}` }}>
              {loading ? "Logging in…" : "Log In →"}
            </button>
          </form>}

          {!forgotMode && <>
          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.08)" }}/>
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "rgba(26,26,46,0.55)" }}>or continue with</span>
            <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.08)" }}/>
          </div>

          {/* Google */}
          <button onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.10)", color: "rgba(26,26,46,0.65)" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.07)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/>
              <path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.08 0-3.84-1.4-4.47-3.29H1.87v2.07A8 8 0 008.98 17z" fill="#34A853"/>
              <path d="M4.51 10.52A4.8 4.8 0 014.26 9c0-.52.09-1.02.25-1.52V5.41H1.87A8 8 0 001 9c0 1.29.31 2.51.87 3.59l2.64-2.07z" fill="#FBBC05"/>
              <path d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.87 5.4L4.5 7.48c.64-1.87 2.4-3.9 4.48-3.9z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-center text-sm mt-6" style={{ color: "#1a1a2e" }}>
            New to the Academy?{" "}
            <Link href="/auth/sign-up" className="font-bold hover:underline" style={{ color: ACCENT }}>
              Create your account
            </Link>
          </p>
          </>}
        </div>
      </div>
    </div>
  );
}
