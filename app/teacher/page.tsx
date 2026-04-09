"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Users, ChevronRight } from "lucide-react";
import type { StudentRosterItem, StudentStatus } from "@/types";

const INTER = "var(--font-inter), system-ui, sans-serif";

// ── Types ─────────────────────────────────────────────────────────────────────

type StudentWithSubjects = StudentRosterItem & {
  subject_stats: Record<string, { attempts: number; avg_score_pct: number }>;
};

type ScoreTier = "high" | "medium" | "struggling" | "not_started";

const TIERS: { key: ScoreTier; label: string; range: string; color: string; bg: string; border: string }[] = [
  { key: "high",        label: "High",        range: "≥ 70%", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  { key: "medium",      label: "Medium",      range: "40–69%", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  { key: "struggling",  label: "Struggling",  range: "< 40%",  color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  { key: "not_started", label: "Not started", range: "",       color: "#9CA3AF", bg: "#F9FAFB", border: "#E5E7EB" },
];

function getTier(pct: number, attempts: number): ScoreTier {
  if (attempts === 0) return "not_started";
  if (pct >= 70) return "high";
  if (pct >= 40) return "medium";
  return "struggling";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLastActive(dateStr?: string): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const STATUS_CFG: Record<StudentStatus, { label: string; color: string; bg: string; border: string }> = {
  active:   { label: "Active",   color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  slipping: { label: "Slipping", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  inactive: { label: "Inactive", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};

function StatusChip({ status }: { status: StudentStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 20,
      fontSize: 12, fontWeight: 500,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function ScoreBar({ pct, width = 56 }: { pct: number; width?: number }) {
  const color      = pct >= 70 ? "#16A34A" : pct >= 40 ? "#D97706" : "#DC2626";
  const trackColor = pct >= 70 ? "#DCFCE7" : pct >= 40 ? "#FEF3C7" : "#FEE2E2";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ width, height: 5, borderRadius: 99, background: trackColor, flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color, minWidth: 30 }}>{pct}%</span>
    </div>
  );
}

// ── Student avatar cell ───────────────────────────────────────────────────────

function AvatarCell({ student }: { student: StudentWithSubjects }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {student.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={student.avatar_url} alt=""
          style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid #E5E7EB" }} />
      ) : (
        <div style={{
          width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
          background: "#EFF6FF", border: "1px solid #BFDBFE",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
        }}>
          {student.avatar_emoji}
        </div>
      )}
      <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{student.display_name}</span>
    </div>
  );
}

// ── Sort header cell ──────────────────────────────────────────────────────────

type SortKey = "display_name" | "level" | "avg_score_pct" | "total_attempts" | "streak_days" | "last_active_date" | "status";

function Th({ label, sortKey, current, dir, onClick, style }: {
  label: string; sortKey: SortKey;
  current: SortKey; dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  style?: React.CSSProperties;
}) {
  const active = current === sortKey;
  return (
    <th onClick={() => onClick(sortKey)} style={{
      padding: "10px 16px", textAlign: "left", userSelect: "none",
      fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
      color: active ? "#374151" : "#9CA3AF", cursor: "pointer", whiteSpace: "nowrap",
      borderBottom: "1px solid #E5E7EB", background: "#F9FAFB",
      ...style,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}
        {active
          ? (dir === "asc" ? <ChevronUp style={{ width: 11, height: 11 }} /> : <ChevronDown style={{ width: 11, height: 11 }} />)
          : <ChevronDown style={{ width: 11, height: 11, opacity: 0.3 }} />}
      </span>
    </th>
  );
}

// ── Insight strip ─────────────────────────────────────────────────────────────

function InsightStrip({ students }: { students: StudentWithSubjects[] }) {
  if (!students.length) return null;
  const inactive = students.filter(s => s.status === "inactive").length;
  const noTests  = students.filter(s => s.total_attempts === 0).length;
  const avg      = Math.round(students.reduce((s, st) => s + st.avg_score_pct, 0) / students.length);
  const items: string[] = [];
  if (inactive > 0) items.push(`${inactive} student${inactive > 1 ? "s" : ""} inactive 7+ days`);
  if (noTests  > 0) items.push(`${noTests} haven't taken any test`);
  if (avg      > 0) items.push(`Class average ${avg}%`);
  if (!items.length) return null;
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
      padding: "10px 14px", borderRadius: 8, marginBottom: 20,
      background: "#EFF6FF", border: "1px solid #BFDBFE",
      fontSize: 13, color: "#1E40AF",
    }}>
      <span style={{ fontWeight: 600, marginRight: 4 }}>Insights —</span>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: "#93C5FD", margin: "0 6px" }}>·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}

// ── ALL-subjects flat table ───────────────────────────────────────────────────

function AllStudentsTable({
  students, onRowClick,
}: {
  students: StudentWithSubjects[];
  onRowClick: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter,  setFilter]  = useState<StudentStatus | "all">("all");

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const statusOrder: Record<StudentStatus, number> = { active: 0, slipping: 1, inactive: 2 };

  const sorted = useMemo(() => {
    const list = filter === "all" ? students : students.filter(s => s.status === filter);
    return [...list].sort((a, b) => {
      let cmp = 0;
      if      (sortKey === "display_name")    cmp = a.display_name.localeCompare(b.display_name);
      else if (sortKey === "level")           cmp = a.level - b.level;
      else if (sortKey === "avg_score_pct")   cmp = a.avg_score_pct - b.avg_score_pct;
      else if (sortKey === "total_attempts")  cmp = a.total_attempts - b.total_attempts;
      else if (sortKey === "streak_days")     cmp = a.streak_days - b.streak_days;
      else if (sortKey === "last_active_date")
        cmp = new Date(a.last_active_date ?? 0).getTime() - new Date(b.last_active_date ?? 0).getTime();
      else if (sortKey === "status")          cmp = statusOrder[a.status] - statusOrder[b.status];
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [students, sortKey, sortDir, filter]);

  const counts = useMemo(() => ({
    all:      students.length,
    active:   students.filter(s => s.status === "active").length,
    slipping: students.filter(s => s.status === "slipping").length,
    inactive: students.filter(s => s.status === "inactive").length,
  }), [students]);

  return (
    <>
      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {(["all", "active", "slipping", "inactive"] as const).map(f => {
          const label = f === "all"
            ? `All (${counts.all})`
            : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f]})`;
          const active = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 13px", borderRadius: 6, border: "1px solid",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              background: active ? "#2563EB" : "#fff",
              color:      active ? "#fff"    : "#6B7280",
              borderColor: active ? "#2563EB" : "#E5E7EB",
            }}>
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th label="Student"     sortKey="display_name"     current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Level"       sortKey="level"            current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Avg Score"   sortKey="avg_score_pct"    current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Tests"       sortKey="total_attempts"   current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Streak"      sortKey="streak_days"      current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Last Active" sortKey="last_active_date" current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Status"      sortKey="status"           current={sortKey} dir={sortDir} onClick={handleSort} />
              <th style={{ padding: "10px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.id} onClick={() => onRowClick(s.id)}
                style={{ cursor: "pointer", borderBottom: i < sorted.length - 1 ? "1px solid #F3F4F6" : "none" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <td style={{ padding: "12px 16px" }}><AvatarCell student={s} /></td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#2563EB" }}>Lv {s.level}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {s.total_attempts > 0 ? <ScoreBar pct={s.avg_score_pct} /> : <span style={{ color: "#D1D5DB", fontSize: 13 }}>—</span>}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 13, color: "#374151" }}>{s.total_attempts}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 13, color: s.streak_days > 0 ? "#D97706" : "#D1D5DB" }}>
                    {s.streak_days > 0 ? `🔥 ${s.streak_days}d` : "—"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>{formatLastActive(s.last_active_date)}</span>
                </td>
                <td style={{ padding: "12px 16px" }}><StatusChip status={s.status} /></td>
                <td style={{ padding: "12px 16px" }}>
                  <ChevronRight style={{ width: 14, height: 14, color: "#D1D5DB" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Subject tier view ─────────────────────────────────────────────────────────

function SubjectTierView({
  students, subject, onRowClick,
}: {
  students: StudentWithSubjects[];
  subject: string;
  onRowClick: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<ScoreTier, boolean>>({ high: false, medium: false, struggling: false, not_started: true });

  const grouped = useMemo(() => {
    const map: Record<ScoreTier, StudentWithSubjects[]> = { high: [], medium: [], struggling: [], not_started: [] };
    for (const s of students) {
      const stat = s.subject_stats[subject];
      const tier = getTier(stat?.avg_score_pct ?? 0, stat?.attempts ?? 0);
      map[tier].push(s);
    }
    // Sort each tier by score desc (not_started by name)
    for (const tier of (["high","medium","struggling"] as ScoreTier[])) {
      map[tier].sort((a, b) => {
        const pa = a.subject_stats[subject]?.avg_score_pct ?? 0;
        const pb = b.subject_stats[subject]?.avg_score_pct ?? 0;
        return pb - pa;
      });
    }
    map.not_started.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return map;
  }, [students, subject]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {TIERS.map(tier => {
        const group = grouped[tier.key];
        if (group.length === 0) return null;
        const isOpen = !collapsed[tier.key];
        return (
          <div key={tier.key} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "hidden" }}>
            {/* Tier header */}
            <button
              onClick={() => setCollapsed(p => ({ ...p, [tier.key]: !p[tier.key] }))}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 18px", cursor: "pointer", background: "none", border: "none",
                borderBottom: isOpen ? "1px solid #E5E7EB" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  color: tier.color, background: tier.bg, border: `1px solid ${tier.border}`,
                }}>
                  {tier.label}{tier.range ? ` — ${tier.range}` : ""}
                </span>
                <span style={{ fontSize: 13, color: "#6B7280" }}>{group.length} student{group.length !== 1 ? "s" : ""}</span>
              </div>
              {isOpen
                ? <ChevronUp   style={{ width: 14, height: 14, color: "#9CA3AF" }} />
                : <ChevronDown style={{ width: 14, height: 14, color: "#9CA3AF" }} />}
            </button>

            {/* Rows */}
            {isOpen && (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["Student", "Platform Level", `Score in ${subject}`, "Tests", "Last Attempt", ""].map((h, i) => (
                      <th key={i} style={{
                        padding: "8px 16px", textAlign: "left",
                        fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                        letterSpacing: "0.06em", color: "#9CA3AF",
                        borderBottom: "1px solid #E5E7EB",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.map((s, i) => {
                    const stat = s.subject_stats[subject];
                    return (
                      <tr key={s.id} onClick={() => onRowClick(s.id)}
                        style={{ cursor: "pointer", borderBottom: i < group.length - 1 ? "1px solid #F3F4F6" : "none" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "11px 16px" }}><AvatarCell student={s} /></td>
                        <td style={{ padding: "11px 16px" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#2563EB" }}>Lv {s.level}</span>
                        </td>
                        <td style={{ padding: "11px 16px" }}>
                          {stat ? <ScoreBar pct={stat.avg_score_pct} width={64} /> : <span style={{ color: "#D1D5DB", fontSize: 13 }}>—</span>}
                        </td>
                        <td style={{ padding: "11px 16px" }}>
                          <span style={{ fontSize: 13, color: "#374151" }}>{stat?.attempts ?? 0}</span>
                        </td>
                        <td style={{ padding: "11px 16px" }}>
                          <span style={{ fontSize: 13, color: "#6B7280" }}>{formatLastActive(s.last_active_date)}</span>
                        </td>
                        <td style={{ padding: "11px 16px" }}>
                          <ChevronRight style={{ width: 14, height: 14, color: "#D1D5DB" }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeacherRosterPage() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentWithSubjects[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  useEffect(() => {
    fetch("/api/teacher/students")
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(({ students: s, subjects: subs }) => {
        setStudents(s ?? []);
        setSubjects(subs ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => ({
    all:      students.length,
    active:   students.filter(s => s.status === "active").length,
    slipping: students.filter(s => s.status === "slipping").length,
    inactive: students.filter(s => s.status === "inactive").length,
  }), [students]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", fontFamily: INTER }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Students</h1>
          <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
            {students.length} student{students.length !== 1 ? "s" : ""}
          </p>
        </div>

        {!loading && students.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { label: "Active",   count: counts.active,   color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
              { label: "Slipping", count: counts.slipping, color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
              { label: "Inactive", count: counts.inactive, color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
            ] as const).map(s => (
              <div key={s.label} style={{
                padding: "6px 14px", borderRadius: 8,
                background: s.bg, border: `1px solid ${s.border}`, textAlign: "center",
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 11, color: s.color, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Insights */}
      {!loading && <InsightStrip students={students} />}

      {/* Subject tabs */}
      {!loading && subjects.length > 0 && (
        <div style={{
          display: "flex", gap: 0, marginBottom: 20,
          borderBottom: "1px solid #E5E7EB",
        }}>
          {["all", ...subjects].map(tab => {
            const active = activeTab === tab;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: "8px 18px", fontSize: 14, fontWeight: 500,
                border: "none", cursor: "pointer", background: "none",
                color: active ? "#2563EB" : "#6B7280",
                borderBottom: active ? "2px solid #2563EB" : "2px solid transparent",
                marginBottom: -1,
              }}>
                {tab === "all" ? "All students" : tab}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 10, color: "#9CA3AF" }}>
          <div style={{ width: 18, height: 18, border: "2px solid #2563EB", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 14 }}>Loading…</span>
        </div>
      )}

      {error && <div style={{ textAlign: "center", padding: "64px 0", fontSize: 14, color: "#DC2626" }}>{error}</div>}

      {!loading && !error && students.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#9CA3AF" }}>
          <Users style={{ width: 36, height: 36, margin: "0 auto 12px", opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>No students have signed up yet.</p>
        </div>
      )}

      {/* Content */}
      {!loading && students.length > 0 && (
        activeTab === "all"
          ? <AllStudentsTable students={students} onRowClick={id => router.push(`/teacher/student/${id}`)} />
          : <SubjectTierView  students={students} subject={activeTab} onRowClick={id => router.push(`/teacher/student/${id}`)} />
      )}
    </div>
  );
}
