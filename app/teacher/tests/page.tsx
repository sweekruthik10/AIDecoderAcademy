"use client";

const INTER = "var(--font-inter), system-ui, sans-serif";

export default function TeacherTestsPage() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", fontFamily: INTER }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Tests</h1>
      <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
        Test analysis coming soon — select a paper to see score distributions and question breakdowns.
      </p>
    </div>
  );
}
