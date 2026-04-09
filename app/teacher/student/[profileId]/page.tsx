"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, X, ChevronLeft as PrevIcon, ChevronRight as NextIcon } from "lucide-react";

const INTER = "var(--font-inter), system-ui, sans-serif";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttemptDetail {
  id: string;
  chapter_title: string;
  subject: string;
  type: "mcq" | "written";
  score: number;
  max_score: number;
  time_taken_secs: number | null;
  submitted_at: string;
  feedback?: Record<string, { score: number; max: number; feedback: string }>;
  annotated_image_urls?: string[];
  written_questions?: { id: string; question: string; marks: number; section: string }[];
}

interface StudentDetail {
  student: {
    id: string;
    display_name: string;
    avatar_emoji: string;
    avatar_url: string | null;
    level: number;
    xp: number;
    streak_days: number;
    badges: { id: string; earned_at: string }[];
    created_at: string;
    last_active_date: string | null;
  };
  summary: {
    total_attempts: number;
    overall_avg_pct: number;
    best_subject: string | null;
    weakest_subject: string | null;
  };
  subjects: { name: string; attempts: number; avg_score_pct: number }[];
  attempts: AttemptDetail[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(secs: number | null): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function scorePct(score: number, max: number) {
  return max > 0 ? Math.round((score / max) * 100) : 0;
}

function scoreColor(pct: number) {
  return pct >= 70 ? "#16A34A" : pct >= 40 ? "#D97706" : "#DC2626";
}

function scoreTrack(pct: number) {
  return pct >= 70 ? "#DCFCE7" : pct >= 40 ? "#FEF3C7" : "#FEE2E2";
}

function memberSince(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

// ── Written exam modal ────────────────────────────────────────────────────────

function WrittenModal({ attempt, onClose }: { attempt: AttemptDetail; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const images = attempt.annotated_image_urls ?? [];
  const qs     = attempt.written_questions    ?? [];
  const fb     = attempt.feedback             ?? {};

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")     onClose();
      if (e.key === "ArrowRight") setPage(p => Math.min(p + 1, images.length - 1));
      if (e.key === "ArrowLeft")  setPage(p => Math.max(p - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  const pct = scorePct(attempt.score, attempt.max_score);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 900, maxHeight: "90vh",
        background: "#fff", borderRadius: 16, overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        {/* Modal header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #E5E7EB", flexShrink: 0,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#111827" }}>
              {attempt.chapter_title} — Written Exam
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#6B7280" }}>
              {attempt.score}/{attempt.max_score} marks · {pct}% · {timeAgo(attempt.submitted_at)}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: "1px solid #E5E7EB",
            background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X style={{ width: 15, height: 15, color: "#6B7280" }} />
          </button>
        </div>

        {/* Body: two columns */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

          {/* Left: answer sheet images */}
          <div style={{ flex: "0 0 55%", borderRight: "1px solid #E5E7EB", display: "flex", flexDirection: "column" }}>
            {images.length > 0 ? (
              <>
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative", background: "#F3F4F6" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={images[page]} alt={`Answer sheet page ${page + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                </div>
                {images.length > 1 && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                    padding: "10px 16px", borderTop: "1px solid #E5E7EB", flexShrink: 0,
                    background: "#fff",
                  }}>
                    <button onClick={() => setPage(p => Math.max(p - 1, 0))} disabled={page === 0}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #E5E7EB", cursor: page === 0 ? "not-allowed" : "pointer", background: page === 0 ? "#F9FAFB" : "#fff" }}>
                      <PrevIcon style={{ width: 14, height: 14, color: page === 0 ? "#D1D5DB" : "#374151" }} />
                    </button>
                    <span style={{ fontSize: 13, color: "#6B7280" }}>Page {page + 1} of {images.length}</span>
                    <button onClick={() => setPage(p => Math.min(p + 1, images.length - 1))} disabled={page === images.length - 1}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #E5E7EB", cursor: page === images.length - 1 ? "not-allowed" : "pointer", background: page === images.length - 1 ? "#F9FAFB" : "#fff" }}>
                      <NextIcon style={{ width: 14, height: 14, color: page === images.length - 1 ? "#D1D5DB" : "#374151" }} />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 14 }}>
                No answer sheet images available.
              </div>
            )}
          </div>

          {/* Right: per-question feedback */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px" }}>
            <h4 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Question Feedback
            </h4>
            {qs.length === 0 && (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>No question details available.</p>
            )}
            {qs.map(q => {
              const qfb   = fb[q.id];
              const qPct  = qfb ? scorePct(qfb.score, qfb.max) : 0;
              const color = qfb ? scoreColor(qPct) : "#9CA3AF";
              return (
                <div key={q.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #F3F4F6" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.5, flex: 1 }}>
                      <span style={{ fontWeight: 600, color: "#6B7280", marginRight: 4 }}>Sec {q.section} ·</span>
                      {q.question}
                    </p>
                    {qfb && (
                      <span style={{
                        flexShrink: 0, fontSize: 13, fontWeight: 700, color,
                        padding: "1px 8px", borderRadius: 6,
                        background: scoreTrack(qPct),
                      }}>
                        {qfb.score}/{qfb.max}
                      </span>
                    )}
                  </div>
                  {qfb?.feedback && (
                    <p style={{ margin: 0, fontSize: 12, color: "#6B7280", lineHeight: 1.55, background: "#F9FAFB", padding: "6px 10px", borderRadius: 6 }}>
                      {qfb.feedback}
                    </p>
                  )}
                  {!qfb && (
                    <p style={{ margin: 0, fontSize: 12, color: "#D1D5DB" }}>Not attempted</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudentDrilldownPage() {
  const params  = useParams();
  const router  = useRouter();
  const profileId = params.profileId as string;

  const [data,         setData]         = useState<StudentDetail | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [modalAttempt, setModalAttempt] = useState<AttemptDetail | null>(null);

  useEffect(() => {
    fetch(`/api/teacher/student/${profileId}`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [profileId]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 10, color: "#9CA3AF", fontFamily: INTER }}>
      <div style={{ width: 18, height: 18, border: "2px solid #2563EB", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 14 }}>Loading…</span>
    </div>
  );

  if (error || !data) return (
    <div style={{ textAlign: "center", padding: "64px 24px", fontFamily: INTER }}>
      <p style={{ fontSize: 14, color: "#DC2626" }}>{error || "Student not found."}</p>
      <button onClick={() => router.back()} style={{ marginTop: 12, fontSize: 13, color: "#2563EB", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
    </div>
  );

  const { student, summary, subjects, attempts } = data;
  const overallColor = scoreColor(summary.overall_avg_pct);
  const overallTrack = scoreTrack(summary.overall_avg_pct);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px", fontFamily: INTER }}>

      {/* Back */}
      <button onClick={() => router.back()} style={{
        display: "flex", alignItems: "center", gap: 4, fontSize: 13,
        color: "#6B7280", background: "none", border: "none", cursor: "pointer",
        padding: 0, marginBottom: 24,
      }}>
        <ChevronLeft style={{ width: 16, height: 16 }} /> Back to class
      </button>

      {/* ── Student header ──────────────────────────────────────────────────── */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB",
        padding: "24px 28px", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 20,
      }}>
        {student.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={student.avatar_url} alt=""
            style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "1px solid #E5E7EB", flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
            background: "#EFF6FF", border: "1px solid #BFDBFE",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
          }}>
            {student.avatar_emoji}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>{student.display_name}</h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 6 }}>
            <span style={{ fontSize: 13, color: "#6B7280" }}>
              <span style={{ fontWeight: 600, color: "#2563EB" }}>Level {student.level}</span>
              {" · "}
              <span>{student.xp.toLocaleString()} XP</span>
            </span>
            {student.streak_days > 0 && (
              <span style={{ fontSize: 13, color: "#D97706" }}>🔥 {student.streak_days} day streak</span>
            )}
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>Member since {memberSince(student.created_at)}</span>
          </div>
          {/* Badges */}
          {student.badges.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
              {student.badges.slice(0, 8).map(b => (
                <span key={b.id} style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 20,
                  background: "#F3F4F6", color: "#6B7280", border: "1px solid #E5E7EB",
                }}>
                  {b.id.replace(/_/g, " ")}
                </span>
              ))}
              {student.badges.length > 8 && (
                <span style={{ fontSize: 11, color: "#9CA3AF", padding: "2px 0" }}>+{student.badges.length - 8} more</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Tests Taken",    value: String(summary.total_attempts),          sub: "all time" },
          { label: "Overall Avg",    value: summary.total_attempts > 0 ? `${summary.overall_avg_pct}%` : "—", sub: "across all tests" },
          { label: "Best Subject",   value: summary.best_subject    ?? "—",          sub: "highest avg" },
          { label: "Needs Work",     value: summary.weakest_subject ?? "—",          sub: "lowest avg" },
        ].map(card => (
          <div key={card.label} style={{
            background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB",
            padding: "18px 20px",
          }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9CA3AF" }}>
              {card.label}
            </p>
            <p style={{ margin: "6px 0 2px", fontSize: 22, fontWeight: 700, color: "#111827" }}>{card.value}</p>
            <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Subject breakdown ───────────────────────────────────────────────── */}
      {subjects.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB" }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>Subject Performance</h2>
          </div>
          <div style={{ padding: "8px 0" }}>
            {subjects.map(sub => {
              const pct   = sub.avg_score_pct;
              const color = scoreColor(pct);
              const track = scoreTrack(pct);
              return (
                <div key={sub.name} style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "10px 20px",
                }}>
                  <span style={{ width: 120, fontSize: 14, fontWeight: 500, color: "#374151", flexShrink: 0 }}>{sub.name}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: track }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 36, textAlign: "right" }}>{pct}%</span>
                  <span style={{ fontSize: 12, color: "#9CA3AF", minWidth: 60 }}>{sub.attempts} test{sub.attempts !== 1 ? "s" : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Attempt history ─────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB" }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>Attempt History</h2>
        </div>

        {attempts.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            No test attempts yet.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                {["Chapter", "Subject", "Type", "Score", "Time", "Date", ""].map((h, i) => (
                  <th key={i} style={{
                    padding: "9px 16px", textAlign: "left",
                    fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                    letterSpacing: "0.06em", color: "#9CA3AF",
                    borderBottom: "1px solid #E5E7EB",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => {
                const pct   = scorePct(a.score, a.max_score);
                const color = scoreColor(pct);
                const track = scoreTrack(pct);
                return (
                  <tr key={a.id} style={{ borderBottom: i < attempts.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                    <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 500, color: "#111827" }}>
                      {a.chapter_title}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{a.subject}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 6,
                        background: a.type === "mcq" ? "#EFF6FF" : "#F5F3FF",
                        color:      a.type === "mcq" ? "#2563EB"  : "#7C3AED",
                        border:     `1px solid ${a.type === "mcq" ? "#BFDBFE" : "#DDD6FE"}`,
                      }}>
                        {a.type === "mcq" ? "MCQ" : "Written"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 48, height: 5, borderRadius: 99, background: track }}>
                          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color }}>{a.score}/{a.max_score}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{fmt(a.time_taken_secs)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{timeAgo(a.submitted_at)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {a.type === "written" && (
                        <button onClick={() => setModalAttempt(a)} style={{
                          fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 6,
                          border: "1px solid #E5E7EB", background: "#fff",
                          color: "#374151", cursor: "pointer",
                        }}>
                          View sheets →
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Written exam modal */}
      {modalAttempt && (
        <WrittenModal attempt={modalAttempt} onClose={() => setModalAttempt(null)} />
      )}
    </div>
  );
}
