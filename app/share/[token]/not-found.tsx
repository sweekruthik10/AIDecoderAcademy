import Link from "next/link";

export default function ShareNotFound() {
  return (
    <main className="min-h-screen bg-[#08080F] text-white flex flex-col items-center justify-center text-center px-6">
      <div className="text-6xl mb-4">🔒</div>
      <h1 className="font-display font-black text-2xl mb-2">Creation not found</h1>
      <p className="text-white/50 mb-6 text-sm max-w-sm">
        This link may have expired, or the creator made it private again.
      </p>
      <Link href="/"
        className="inline-flex items-center gap-2 font-bold text-sm px-5 py-3 rounded-xl text-white"
        style={{ background: "#7C3AED" }}>
        Go to AI Decoder Academy →
      </Link>
    </main>
  );
}
