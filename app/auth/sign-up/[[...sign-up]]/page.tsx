"use client";
import { useState, useEffect } from "react";
import { useSignUp, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ACCENT      = "#7C3AED";
const ACCENT_GLOW = "rgba(124,58,237,0.4)";

const BOARDS = ["CBSE", "ICSE", "State Board"];
const GRADES = ["6", "7", "8", "9", "10"];

function gradeToAgeGroup(grade: string) {
  const g = parseInt(grade);
  if (g <= 7) return "11-13";
  return "14+";
}

// Reusable light input
function DarkInput({ icon, ...props }: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(26,26,46,0.35)" }}>{icon}</div>
      <input
        {...props}
        style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.12)", color: "#1a1a2e" }}
        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all outline-none placeholder:text-black/25
          focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)]"
      />
    </div>
  );
}

export default function SignUpPage() {
  const { signUp, isLoaded, setActive } = useSignUp();
  const { isSignedIn }       = useAuth();
  const router               = useRouter();

  const [step,         setStep]         = useState(1);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed,       setAgreed]       = useState(false);
  const [verifying,    setVerifying]    = useState(false);
  const [code,         setCode]         = useState("");
  const [fullName,     setFullName]     = useState("");
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [board,        setBoard]        = useState("CBSE");
  const [grade,        setGrade]        = useState("8");

  useEffect(() => {
    if (isSignedIn && !verifying) router.replace("/dashboard");
  }, [isSignedIn, router, verifying]);

  // Show loading dots while Clerk initialises (mirrors sign-in behaviour)
  if (!isLoaded || (isSignedIn && !verifying)) {
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

  const passwordStrength =
    password.length === 0 ? 0
    : password.length < 6 ? 1
    : password.length < 10 ? 2
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4 : 3;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][passwordStrength];
  const strengthColors = ["", "#FF2D78", "#FFB400", "#00D4FF", "#00FF94"];

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      setError("Please fill in all fields. Password must be at least 8 characters.");
      return;
    }
    setError("");
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !agreed) return;
    setLoading(true);
    setError("");
    try {
      await signUp.create({
        firstName:    fullName.split(" ")[0],
        lastName:     fullName.split(" ").slice(1).join(" ") || "",
        emailAddress: email,
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerifying(true);
    } catch (err: unknown) {
      const clerkError = (err as { errors?: { message: string }[] })?.errors?.[0];
      setError(clerkError?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError("");
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        // Await profile creation so the hub never sees a null profile on first load.
        await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: fullName.split(" ")[0],
            avatar_emoji: "🚀",
            age_group:    gradeToAgeGroup(grade),
            interests:    [],
          }),
        }).catch(() => {});
        await setActive({
          session: result.createdSessionId,
          beforeEmit: () => router.replace("/dashboard"),
        });
      }
    } catch (err: unknown) {
      const clerkError = (err as { errors?: { message: string }[] })?.errors?.[0];
      setError(clerkError?.message ?? "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!isLoaded) return;
    if (isSignedIn) { router.replace("/dashboard"); return; }
    try {
      await signUp.authenticateWithRedirect({
        strategy:            "oauth_google",
        redirectUrl:         "/auth/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err: unknown) {
      const clerkError = (err as { errors?: { message: string }[] })?.errors?.[0];
      setError(clerkError?.message ?? "Google sign-up failed.");
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "0 8px 48px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset",
  };

  // ── Email verification screen ────────────────────────────────────────────
  if (verifying) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-3xl overflow-hidden" style={cardStyle}>
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)` }}/>
          <div className="px-8 py-10 text-center">
            <div className="text-5xl mb-4">📬</div>
            <h2 className="font-display font-black text-2xl mb-2" style={{ color: "#1a1a2e" }}>Check your inbox!</h2>
            <p className="text-sm mb-8" style={{ color: "rgba(26,26,46,0.5)" }}>
              We sent a 6-digit code to{" "}
              <span className="font-bold" style={{ color: ACCENT }}>{email}</span>
            </p>
            <div id="clerk-captcha"/>
            <form onSubmit={handleVerify} className="space-y-4">
              <input
                value={code} onChange={e => setCode(e.target.value)}
                placeholder="0 0 0 0 0 0"
                maxLength={6} autoFocus
                style={{
                  background: "rgba(0,0,0,0.04)",
                  border: `1px solid ${ACCENT}40`,
                  color: "#1a1a2e",
                  letterSpacing: "0.4em",
                  boxShadow: `0 0 20px ${ACCENT}12`,
                }}
                className="w-full text-center text-2xl font-display font-black py-4 rounded-xl outline-none
                  focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)] transition-all"
              />
              {error && (
                <p className="text-xs px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,45,120,0.08)", border: "1px solid rgba(255,45,120,0.2)", color: "#e0185a" }}>
                  {error}
                </p>
              )}
              <button type="submit" disabled={loading || code.length < 6}
                className="w-full font-display font-black py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 24px ${ACCENT_GLOW}` }}>
                {loading ? "Verifying…" : "Verify & Launch 🚀"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg">
      <div className="rounded-3xl overflow-hidden" style={cardStyle}>
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)` }}/>

        {/* Step header */}
        <div className="px-8 pt-7 pb-5" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full"
              style={{ background: `${ACCENT}15`, color: ACCENT, border: `1px solid ${ACCENT}30` }}>
              Step {step} of 2
            </span>
            <div className="flex gap-2">
              {[1, 2].map(i => (
                <div key={i} className="h-1 rounded-full transition-all"
                  style={{
                    width: step === i ? 32 : 8,
                    background: step >= i ? ACCENT : "rgba(0,0,0,0.12)",
                    boxShadow: step === i ? `0 0 8px ${ACCENT_GLOW}` : "none",
                  }}/>
              ))}
            </div>
          </div>
          <h1 className="font-display font-black text-2xl mb-1" style={{ color: "#1a1a2e" }}>
            {step === 1 ? "Create your account" : "Academic profile"}
          </h1>
          <p className="text-sm" style={{ color: "rgba(26,26,46,0.5)" }}>
            {step === 1
              ? "Join students decoding the future of AI."
              : "Help us personalise your learning experience."}
          </p>
        </div>

        <div className="px-8 py-6">
          <div id="clerk-captcha" style={{ display: "none" }}/>

          {step === 1 ? (
            <form onSubmit={handleNext} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.45)" }}>Full name</label>
                  <DarkInput
                    value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="Rahul Sharma"
                    icon={
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M2 14c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    }
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.45)" }}>Email</label>
                  <DarkInput
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@school.com"
                    icon={
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M1 6l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold mb-2 uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.45)" }}>Password</label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(26,26,46,0.35)" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <input
                    type={showPassword ? "text" : "password"} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.12)", color: "#1a1a2e" }}
                    className="w-full pl-10 pr-10 py-3 rounded-xl text-sm transition-all outline-none placeholder:text-black/25
                      focus:border-[#7C3AED] focus:ring-2 focus:ring-[rgba(124,58,237,0.15)]"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: "rgba(26,26,46,0.35)" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 flex gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="h-1 flex-1 rounded-full transition-all"
                          style={{ background: i <= passwordStrength ? strengthColors[passwordStrength] : "rgba(0,0,0,0.10)" }}/>
                      ))}
                    </div>
                    <span className="text-[10px] font-mono w-14 text-right" style={{ color: strengthColors[passwordStrength] ?? "rgba(26,26,46,0.3)" }}>
                      {strengthLabel}
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-xs px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,45,120,0.08)", border: "1px solid rgba(255,45,120,0.2)", color: "#e0185a" }}>
                  {error}
                </p>
              )}

              <button type="submit"
                className="w-full font-display font-black py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 24px ${ACCENT_GLOW}` }}>
                Next — Academic profile →
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.08)" }}/>
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "rgba(26,26,46,0.35)" }}>or</span>
                <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.08)" }}/>
              </div>

              <button type="button" onClick={handleGoogle}
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
                Sign up with Google
              </button>

              <p className="text-center text-sm" style={{ color: "rgba(26,26,46,0.45)" }}>
                Already a member?{" "}
                <Link href="/auth/sign-in" className="font-bold hover:underline" style={{ color: ACCENT }}>
                  Log in
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Board */}
              <div>
                <label className="block text-[10px] font-bold mb-2.5 uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.45)" }}>Education board</label>
                <div className="flex gap-2">
                  {BOARDS.map(b => (
                    <button key={b} type="button" onClick={() => setBoard(b)}
                      className="px-4 py-2 rounded-xl text-sm font-bold border transition-all"
                      style={{
                        background: board === b ? `${ACCENT}15` : "rgba(0,0,0,0.04)",
                        borderColor: board === b ? `${ACCENT}50` : "rgba(0,0,0,0.10)",
                        color: board === b ? ACCENT : "rgba(26,26,46,0.5)",
                        boxShadow: board === b ? `0 0 12px ${ACCENT_GLOW}` : "none",
                      }}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grade */}
              <div>
                <label className="block text-[10px] font-bold mb-2.5 uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.45)" }}>Grade / Class</label>
                <div className="flex gap-2">
                  {GRADES.map(g => (
                    <button key={g} type="button" onClick={() => setGrade(g)}
                      className="w-11 h-11 rounded-xl text-sm font-black border transition-all"
                      style={{
                        background: grade === g ? `${ACCENT}15` : "rgba(0,0,0,0.04)",
                        borderColor: grade === g ? `${ACCENT}50` : "rgba(0,0,0,0.10)",
                        color: grade === g ? ACCENT : "rgba(26,26,46,0.5)",
                        boxShadow: grade === g ? `0 0 12px ${ACCENT_GLOW}` : "none",
                      }}>
                      {g}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] mt-2" style={{ color: "rgba(26,26,46,0.35)" }}>Helps us adapt the AI curriculum to your level.</p>
              </div>

              {/* Terms */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5 flex-shrink-0">
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="sr-only"/>
                  <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
                    style={{
                      background: agreed ? ACCENT : "rgba(0,0,0,0.04)",
                      borderColor: agreed ? ACCENT : "rgba(0,0,0,0.18)",
                      boxShadow: agreed ? `0 0 10px ${ACCENT_GLOW}` : "none",
                    }}>
                    {agreed && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-xs leading-relaxed" style={{ color: "rgba(26,26,46,0.5)" }}>
                  I agree to the{" "}
                  <span className="font-semibold" style={{ color: ACCENT }}>Privacy Policy</span> and{" "}
                  <span className="font-semibold" style={{ color: ACCENT }}>Student Safety Guidelines</span>.
                  Ready to start my AI decoding journey!
                </span>
              </label>

              {error && (
                <p className="text-xs px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,45,120,0.08)", border: "1px solid rgba(255,45,120,0.2)", color: "#e0185a" }}>
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-none px-5 py-3.5 rounded-xl text-sm font-bold transition-all"
                  style={{ border: "1px solid rgba(0,0,0,0.12)", color: "rgba(26,26,46,0.5)", background: "rgba(0,0,0,0.03)" }}>
                  ← Back
                </button>
                <button type="submit" disabled={loading || !agreed}
                  className="flex-1 font-display font-black py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                  style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 24px ${ACCENT_GLOW}` }}>
                  {loading ? "Creating account…" : "Launch my journey 🚀"}
                </button>
              </div>

              <div className="flex items-center justify-center gap-5">
                <span className="text-[10px]" style={{ color: "rgba(26,26,46,0.4)" }}>✅ COPPA Compliant</span>
                <span className="text-[10px]" style={{ color: "rgba(26,26,46,0.4)" }}>🔒 Student-safe</span>
                <span className="text-[10px]" style={{ color: "rgba(26,26,46,0.4)" }}>🎓 Teacher monitored</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
