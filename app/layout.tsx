import type { Metadata } from "next";
import { Syne, DM_Sans, JetBrains_Mono, Space_Grotesk, Outfit, Nunito, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
  weight: ["400", "600", "700", "800", "900"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Decoder Academy",
  description: "A safe AI-powered learning playground for curious minds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${syne.variable} ${dmSans.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} ${outfit.variable} ${nunito.variable} ${inter.variable}`}
      >
        <body className="font-body bg-[#08080F] text-white antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}