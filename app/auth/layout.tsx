import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#08080F] text-white relative flex flex-col">

      {/* ── Ambient background ─────────────────────────────────────────── */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 65%)", filter: "blur(60px)" }}/>
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,212,255,0.12) 0%, transparent 65%)", filter: "blur(80px)" }}/>
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}/>
        {/* Constellation dots */}
        {[
          [5,10],[92,8],[15,50],[88,45],[50,90],[25,78],[78,70],[40,20],[65,35],
        ].map(([x, y], i) => (
          <div key={i} className="absolute rounded-full bg-white"
            style={{ left: `${x}%`, top: `${y}%`, width: i % 3 === 0 ? 2 : 1, height: i % 3 === 0 ? 2 : 1, opacity: 0.2 + (i % 3) * 0.1 }}/>
        ))}
        {/* Decorative orbit rings */}
        <div className="absolute top-16 right-16 opacity-[0.07]">
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
            <circle cx="60" cy="60" r="55" stroke="#7C3AED" strokeWidth="1.5" strokeDasharray="8 5"/>
            <circle cx="60" cy="60" r="35" stroke="#7C3AED" strokeWidth="1" strokeDasharray="5 4"/>
          </svg>
        </div>
        <div className="absolute bottom-24 left-10 opacity-[0.06]">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <path d="M40 5 L55 25 L75 30 L60 50 L65 70 L40 60 L15 70 L20 50 L5 30 L25 25 Z"
              stroke="#00D4FF" strokeWidth="1.5" fill="none"/>
          </svg>
        </div>
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5 max-w-6xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-sm"
            style={{ background: "linear-gradient(135deg, #7C3AED, #5B21B6)", boxShadow: "0 0 16px rgba(124,58,237,0.45)" }}>
            <span style={{ color: "#C8FF00" }}>AI</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-display font-black text-white text-base leading-none">AI</span>
            <span className="font-display font-black text-base leading-none" style={{ color: "#7C3AED" }}>Decoder</span>
            <span className="font-display font-black text-white text-base leading-none">Academy</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/auth/sign-in"
            className="text-sm font-semibold text-white/50 hover:text-white transition-colors px-4 py-2 rounded-xl hover:bg-white/[0.06]">
            Log in
          </Link>
          <Link href="/auth/sign-up"
            className="text-sm font-bold px-4 py-2 rounded-xl border border-white/[0.12] text-white/70 hover:text-white hover:border-white/25 transition-all">
            Sign up
          </Link>
        </div>
      </nav>

      {/* ── Page content ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        {children}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="relative z-10 text-center py-5 border-t border-white/[0.05] text-[11px] text-white/25">
        © 2026 AI Decoder Academy · Safe for students aged 11–16 · Teacher accounts available
      </footer>
    </div>
  );
}
