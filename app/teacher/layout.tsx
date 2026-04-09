"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import type { TeacherProfile } from "@/types";

const INTER = "var(--font-inter), system-ui, sans-serif";

const NAV_LINKS = [
  { href: "/teacher",       label: "Class"  },
  { href: "/teacher/tests", label: "Tests"  },
];

// ── Onboarding ────────────────────────────────────────────────────────────────
function TeacherOnboarding({ onCreated }: { onCreated: (t: TeacherProfile) => void }) {
  const [name,    setName]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/teacher/profile", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ display_name: name.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { teacher } = await res.json();
      onCreated(teacher);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F6FA", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: INTER }}>
      <div style={{ width: "100%", maxWidth: 420, margin: "0 16px", background: "#fff", borderRadius: 16, border: "1px solid #E2E4E9", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: "36px 32px" }}>
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#2563EB" }}>
            Teacher Setup
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "6px 0 8px" }}>
            Set up your profile
          </h1>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
            You'll have full visibility into student scores, test performance, and activity.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Ms. Sharma"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "9px 12px", borderRadius: 8,
                border: "1px solid #D1D5DB", fontSize: 14,
                color: "#111827", background: "#fff", outline: "none",
              }}
            />
          </div>

          {error && <p style={{ fontSize: 13, color: "#DC2626" }}>{error}</p>}

          <button
            type="submit"
            disabled={!name.trim() || loading}
            style={{
              padding: "10px 0", borderRadius: 8, border: "none",
              background: loading || !name.trim() ? "#E5E7EB" : "#2563EB",
              color: loading || !name.trim() ? "#9CA3AF" : "#fff",
              fontSize: 14, fontWeight: 600, cursor: loading || !name.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating…" : "Continue →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const [teacher, setTeacher] = useState<TeacherProfile | null | undefined>(undefined);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/teacher/profile")
      .then(r => r.ok ? r.json() : { teacher: null })
      .then(({ teacher: t }) => setTeacher(t))
      .catch(() => setTeacher(null));
  }, []);

  if (teacher === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F6FA", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 20, height: 20, border: "2px solid #2563EB", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (teacher === null) {
    return <TeacherOnboarding onCreated={t => setTeacher(t)} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F5F6FA", fontFamily: INTER }}>
      {/* Nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "#fff", borderBottom: "1px solid #E2E4E9",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 56,
      }}>
        {/* Left: logo + links */}
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <Link href="/teacher" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: "#2563EB" }}>AI</span>
            <span style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>Decoder</span>
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em",
              padding: "2px 6px", borderRadius: 4,
              background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE",
              marginLeft: 2,
            }}>
              Teacher
            </span>
          </Link>

          <div style={{ display: "flex", gap: 4 }}>
            {NAV_LINKS.map(link => {
              const active = link.href === "/teacher"
                ? pathname === "/teacher"
                : pathname.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href} style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 14, fontWeight: 500,
                  textDecoration: "none",
                  background: active ? "#EFF6FF" : "transparent",
                  color: active ? "#2563EB" : "#6B7280",
                }}>
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: name + user */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#9CA3AF" }}>{teacher.display_name}</span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      <main>{children}</main>
    </div>
  );
}
