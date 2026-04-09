import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SharePageClient } from "./SharePageClient";

export const revalidate = 3600; // ISR: revalidate once per hour

async function getShareData(token: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/share/${token}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params;
  const data = await getShareData(token);
  if (!data) return { title: "Not found — AI Decoder Academy" };

  const { creation, creator } = data;
  const desc = `${creator.first_name} made this ${creation.output_type} with AI on AI Decoder Academy!`;
  const ogUrl = `/api/share/${token}/og`;

  return {
    title: `${creation.title} — AI Decoder Academy`,
    description: desc,
    openGraph: {
      title:       creation.title,
      description: desc,
      images:      [{ url: ogUrl, width: 1200, height: 630 }],
      type:        "website",
    },
    twitter: {
      card:        "summary_large_image",
      title:       creation.title,
      description: desc,
      images:      [ogUrl],
    },
  };
}

export default async function SharePage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const data = await getShareData(token);
  if (!data) notFound();

  const { creation, creator } = data;

  return (
    <main className="min-h-screen bg-[#08080F] text-white flex flex-col">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-2 font-black text-white text-base">
          🧠 <span>AI<span className="text-[#7C3AED]">Decoder</span> Academy</span>
        </Link>
      </nav>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center px-4 py-10 max-w-3xl mx-auto w-full">
        <SharePageClient creation={creation} creator={creator} token={token} />
      </div>

      {/* Footer */}
      <footer className="text-center py-5 border-t border-white/[0.06] text-xs text-white/25">
        © 2026 AI Decoder Academy · Safe AI for students aged 11–16
      </footer>
    </main>
  );
}
