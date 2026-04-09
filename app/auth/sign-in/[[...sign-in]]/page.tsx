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

  return (
    <div className="w-full max-w-md">
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
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(26,26,46,0.4)" }}>
              AI Decoder Academy
            </div>
            <h1 className="font-display font-black text-2xl mb-1.5" style={{ color: "#1a1a2e" }}>
              Welcome back! 🚀
            </h1>
            <p className="text-sm" style={{ color: "rgba(26,26,46,0.5)" }}>
              Your arenas are waiting. Ready for your next session?
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[10px] font-bold mb-2 uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.45)" }}>
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
                  style={{
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.12)",
                    color: "#1a1a2e",
                  }}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all outline-none placeholder:text-black/25
                    focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.45)" }}>
                  Password
                </label>
                <Link href="#" className="text-[10px] font-semibold hover:underline" style={{ color: ACCENT }}>
                  Forgot password?
                </Link>
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
                  style={{
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.12)",
                    color: "#1a1a2e",
                  }}
                  className="w-full pl-10 pr-10 py-3 rounded-xl text-sm transition-all outline-none placeholder:text-black/25
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
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.08)" }}/>
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "rgba(26,26,46,0.35)" }}>or continue with</span>
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

          <p className="text-center text-sm mt-6" style={{ color: "rgba(26,26,46,0.45)" }}>
            New to the Academy?{" "}
            <Link href="/auth/sign-up" className="font-bold hover:underline" style={{ color: ACCENT }}>
              Create your account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
