"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpenCheck, Loader2 } from "lucide-react";
import { ChapterPicker }      from "@/components/classroom/ChapterPicker";
import { ChapterMapPage }    from "@/components/classroom/ChapterMapPage";
import { ObjectivePage }    from "@/components/classroom/ObjectivePage";
import { ClassroomArena }  from "@/components/classroom/ClassroomArena";
import { TestTypeSelector } from "@/components/classroom/TestTypeSelector";
import { MCQTest, type SubmitResult as MCQResult } from "@/components/classroom/MCQTest";
import { ScoreReport }      from "@/components/classroom/ScoreReport";
import { WrittenTest, type WrittenResult } from "@/components/classroom/WrittenTest";
import { WrittenScoreReport } from "@/components/classroom/WrittenScoreReport";
import { ProctoringGuard }  from "@/components/classroom/ProctoringGuard";
import { MathChapterMapPage } from "@/components/classroom/MathChapterMapPage";
import { TeacherCharacter } from "@/components/classroom/TeacherCharacter";
import { NotesUpload }      from "@/components/classroom/NotesUpload";
import { CorrectionReport } from "@/components/classroom/CorrectionReport";
import type { Chapter, MCQQuestion, WrittenQuestion, WrittenFeedbackItem, Profile, CorrectionResult } from "@/types";

const NAVY = "#0f1c4d";
const GOLD = "#C8A84B";

// ── Subject tiles configuration ───────────────────────────────────────────────
const LEFT_SUBJECTS = [
  { id: "mathematics", src: "/classroom/mathematics.png", name: "Mathematics",  hasData: true  },
  { id: "physics",     src: "/classroom/physics.png",     name: "Physics",      hasData: false },
  { id: "chemistry",   src: "/classroom/chemistry.png",   name: "Chemistry",    hasData: true  },
  { id: "english",     src: "/classroom/english.png",     name: "English",      hasData: false },
] as const;

const RIGHT_SUBJECTS = [
  { id: "hindi",    src: "/classroom/hindi.png",    name: "Hindi",                 hasData: false },
  { id: "social",   src: "/classroom/social.png",   name: "Social Science",        hasData: false },
  { id: "computer", src: "/classroom/computer.png", name: "Computer Applications", hasData: false },
  { id: "biology",  src: "/classroom/biology.png",  name: "Biology",               hasData: false },
] as const;

// ── Leaderboard (same as hub) ─────────────────────────────────────────────────
type LeaderboardEntry = {
  display_name: string; avatar_emoji: string; xp: number;
  level: number; streak_days: number; active_arena: number;
  rank: number; is_current_user: boolean;
};

const ARENA_ACCENTS: Record<number, string> = {
  1:"#7C3AED",2:"#00D4FF",3:"#FF6B2B",4:"#00FF94",5:"#FF2D78",6:"#C8FF00",
};

const PODIUM_META = [
  { rank:2, ring:"#C0C0C0", glow:"rgba(192,192,192,0.35)", platform:28, avatar:30, label:"🥈" },
  { rank:1, ring:"#FFD700", glow:"rgba(255,215,0,0.40)",   platform:42, avatar:38, label:"👑" },
  { rank:3, ring:"#CD7F32", glow:"rgba(205,127,50,0.35)",  platform:18, avatar:26, label:"🥉" },
];

function PodiumSpot({ entry, meta }: { entry: LeaderboardEntry; meta: typeof PODIUM_META[0] }) {
  const isMe = entry.is_current_user;
  const accent = ARENA_ACCENTS[entry.active_arena] ?? "#7C3AED";
  return (
    <motion.div className="flex flex-col items-center flex-1"
      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
      transition={{ duration:0.4, delay: meta.rank===1 ? 0 : 0.15, ease:[0.16,1,0.3,1] }}>
      <div style={{ fontSize: meta.rank===1 ? 14 : 12, marginBottom:3 }}>{meta.label}</div>
      <div className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{ width:meta.avatar, height:meta.avatar,
          background: isMe ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.85)",
          border:`2.5px solid ${meta.ring}`, boxShadow:`0 0 10px ${meta.glow}`,
          fontSize: meta.avatar*0.52 }}>
        {entry.avatar_emoji || "🧑‍💻"}
      </div>
      <div className="w-1.5 h-1.5 rounded-full mt-1.5" style={{ background:accent }} />
      <div className="font-black text-center truncate mt-0.5"
        style={{ fontSize:10, color: isMe?"#7C3AED":"#1a1a2e", maxWidth:64, lineHeight:1.2 }}>
        {isMe ? "You" : entry.display_name.split(" ")[0]}
      </div>
      <div className="font-black" style={{ fontSize:10, color:"#7C3AED", marginTop:1 }}>
        {entry.xp.toLocaleString()}
      </div>
      <div className="w-full rounded-t-lg flex items-end justify-center pb-1 mt-2"
        style={{ height:meta.platform,
          background:`linear-gradient(180deg, ${meta.ring}28, ${meta.ring}0c)`,
          borderTop:`1.5px solid ${meta.ring}55`, borderLeft:`1px solid ${meta.ring}33`,
          borderRight:`1px solid ${meta.ring}33`, fontSize:11, color:meta.ring, fontWeight:900 }}>
        {meta.rank}
      </div>
    </motion.div>
  );
}

function LeaderboardRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const isMe = entry.is_current_user;
  const accent = ARENA_ACCENTS[entry.active_arena] ?? "#7C3AED";
  return (
    <motion.div className="flex items-center gap-2 px-2 py-2 rounded-xl"
      initial={{ opacity:0, x:10 }} animate={{ opacity:1, x:0 }}
      transition={{ duration:0.3, delay: index*0.04 }}
      style={{ background: isMe ? "rgba(124,58,237,0.08)" : "rgba(0,0,0,0.02)",
        border: isMe ? "1px solid rgba(124,58,237,0.15)" : "1px solid transparent" }}>
      <div className="w-5 font-black text-center flex-shrink-0" style={{ fontSize:10, color:"#bbb" }}>
        {entry.rank}
      </div>
      <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background:accent }} />
      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
        style={{ background: isMe ? "rgba(124,58,237,0.10)" : "rgba(0,0,0,0.05)", fontSize:13 }}>
        {entry.avatar_emoji || "🧑‍💻"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate" style={{ fontSize:11, color: isMe?"#7C3AED":"#1a1a2e", lineHeight:1 }}>
          {isMe ? "You" : entry.display_name.split(" ")[0]}
        </div>
        <div style={{ fontSize:9, color:"#bbb", lineHeight:1, marginTop:2 }}>Lv {entry.level}</div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="font-black" style={{ fontSize:11, color: isMe?"#7C3AED":"#333", lineHeight:1 }}>
          {entry.xp.toLocaleString()}
        </div>
      </div>
    </motion.div>
  );
}

function LeaderboardPanel() {
  const [data,    setData]    = useState<{ top10: LeaderboardEntry[]; isInTop10: boolean; currentUserRank: number|null }|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard").then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const entries      = data?.top10 ?? [];
  const podiumEntries = entries.slice(0, 3);
  const listEntries   = entries.slice(3);

  return (
    <div style={{ height:"75%", display:"flex", flexDirection:"column", paddingRight:12, paddingBottom:12, paddingTop:4, overflow:"hidden" }}>
      <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", borderRadius:16, overflow:"hidden",
        background:"rgba(255,255,255,0.90)", backdropFilter:"blur(20px)",
        boxShadow:"0 8px 32px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset",
        border:"1px solid rgba(255,255,255,0.75)" }}>
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5"
          style={{ background:"linear-gradient(135deg, rgba(124,58,237,0.10), rgba(0,212,255,0.05))", borderBottom:"1px solid rgba(0,0,0,0.06)" }}>
          <span style={{ fontSize:16 }}>🏆</span>
          <span className="font-black tracking-tight flex-1" style={{ fontSize:13, color:"#1a1a2e" }}>Leaderboard</span>
        </div>

        {loading ? (
          <div className="p-3 flex flex-col gap-2">
            {Array.from({ length:5 }).map((_,i) => (
              <div key={i} className="h-8 rounded-xl animate-pulse" style={{ background:"rgba(0,0,0,0.05)" }} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p style={{ fontSize:11, color:"#bbb" }}>No data yet</p>
          </div>
        ) : (
          <>
            {podiumEntries.length === 3 && (
              <div className="flex-shrink-0 flex items-end gap-1 px-3 pt-4 pb-0"
                style={{ background:"linear-gradient(180deg, rgba(124,58,237,0.04), transparent)" }}>
                {PODIUM_META.map(meta => {
                  const entry = podiumEntries.find(e => e.rank === meta.rank);
                  return entry ? <PodiumSpot key={meta.rank} entry={entry} meta={meta} /> : null;
                })}
              </div>
            )}
            {listEntries.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0">
                  <div className="flex-1 h-px" style={{ background:"rgba(0,0,0,0.06)" }} />
                  <span style={{ fontSize:9, color:"#ccc", fontWeight:700, letterSpacing:"0.08em" }}>RANKING</span>
                  <div className="flex-1 h-px" style={{ background:"rgba(0,0,0,0.06)" }} />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth:"none" }}>
                  <div className="flex flex-col gap-0.5 px-2 pb-2">
                    {listEntries.map((entry, i) => <LeaderboardRow key={entry.rank} entry={entry} index={i} />)}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Subject tile ──────────────────────────────────────────────────────────────
function SubjectTile({ src, name, hasData, onClick }: {
  src: string; name: string; hasData: boolean; onClick: (subject: string) => void;
}) {
  return (
    <motion.div
      className="cl-img relative"
      style={{ width:"100%", backgroundImage:`url(${src})`, backgroundSize:"cover",
        backgroundPosition:"center", cursor: hasData ? "pointer" : "not-allowed" }}
      whileHover={hasData ? { scale:1.02 } : {}}
      whileTap={hasData ? { scale:0.98 } : {}}
      transition={{ duration:0.18, ease:[0.16,1,0.3,1] }}
      onClick={hasData ? () => onClick(name) : undefined}
    >
      {/* Locked overlay — always visible, mirrors arena lock style */}
      {!hasData && (
        <>
          <div aria-hidden className="absolute inset-0"
            style={{ backdropFilter:"blur(1.5px) saturate(85%)", WebkitBackdropFilter:"blur(1.5px) saturate(85%)" as any,
              background:"rgba(8,16,32,0.08)", pointerEvents:"none" }} />
          <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center justify-center rounded-full"
              style={{ width:40, height:40,
                background:"linear-gradient(180deg,#0B1A2F 0%,#050E1F 100%)",
                border:"1.5px solid rgba(125,211,252,0.65)",
                boxShadow:"0 0 18px rgba(0,212,255,0.5), inset 0 0 10px rgba(0,212,255,0.18)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="#E8F4FF" strokeWidth="1.8"/>
                <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#E8F4FF" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── Classroom landing (hub layout) ────────────────────────────────────────────
function ClassroomLanding({ profile, onEnter }: { profile: Profile|null; onEnter: (subjectId: string) => void }) {
  const firstName = (profile?.display_name ?? "Explorer").split(" ")[0];
  return (
    <div className="relative w-full flex flex-col overflow-hidden"
      style={{ height:"100dvh", fontFamily:"var(--font-dm-sans,'DM Sans',sans-serif)" }}>

      <style>{`
        .cl-grid { grid-template-columns: 23fr 34fr 23fr 20fr; }
        .cl-spacer { height: 18%; }
        .cl-col-left  { padding-left:12px; padding-top:60px; transform:translateX(120px); overflow:hidden; }
        .cl-col-right { padding-right:12px; padding-top:60px; transform:translateX(0px); overflow:hidden; }
        .cl-img { display:block; width:100%; height:calc((100dvh - 38dvh - 68px) / 4); margin:0; padding:0; }
        .cl-leaderboard {}
        @media (max-width:1280px) { .cl-grid { grid-template-columns:25fr 30fr 25fr 20fr; } }
        @media (max-width:1100px) { .cl-grid { grid-template-columns:26fr 48fr 26fr 0fr; } .cl-leaderboard { display:none; } }
        @media (max-height:760px) { .cl-spacer{height:14%;} .cl-col-left{padding-top:32px;} .cl-col-right{padding-top:32px;} .cl-img{height:calc((100dvh - 20dvh - 60px) / 4);} }
        @media (max-height:600px) { .cl-spacer{height:10%;} .cl-col-left{padding-top:16px;} .cl-col-right{padding-top:16px;} .cl-img{height:calc((100dvh - 20dvh - 60px) / 4);} }
      `}</style>

      {/* Hub background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/panels/background.png" alt="" aria-hidden draggable={false}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{ zIndex:0 }} />

      {/* Stats bar */}
      <div className="cl-spacer relative flex-shrink-0" style={{ zIndex:10 }}>
        <div className="absolute bottom-[-24px]" style={{ left:"44%", transform:"translateX(-50%)" }}>
          <div className="flex items-center px-4 py-2 rounded-2xl"
            style={{ background:"rgba(255,255,255,0.92)", backdropFilter:"blur(16px)",
              boxShadow:"0 4px 24px rgba(0,0,0,0.08)", border:"1px solid rgba(255,255,255,0.7)",
              whiteSpace:"nowrap" }}>
            {[
              { icon:"📚", label:"Subjects",   value:"8"  },
              { icon:"📝", label:"Chapters",   value:"2"  },
              { icon:"🧪", label:"Questions",  value:"80" },
              { icon:"🎯", label:"Tests",      value:"2"  },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center">
                {i > 0 && <div className="w-px h-6 mx-3" style={{ background:"rgba(0,0,0,0.08)" }} />}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{s.icon}</span>
                  <div>
                    <div className="font-black text-[13px] leading-none" style={{ color:"#1a1a2e" }}>{s.value}</div>
                    <div className="text-[10px] leading-none mt-0.5" style={{ color:"#aaa" }}>{s.label}</div>
                  </div>
                </div>
              </div>
            ))}
            <div className="w-px h-6 mx-3" style={{ background:"rgba(0,0,0,0.08)" }} />
            <div className="text-[12px] font-medium" style={{ color:"#666" }}>
              Ready to learn, <span className="font-black" style={{ color:"#7C3AED" }}>{firstName}!</span> 🎓
            </div>
            <div className="ml-3 w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
              style={{ background:"linear-gradient(135deg,rgba(124,58,237,0.15),rgba(124,58,237,0.3))",
                border:"2px solid rgba(124,58,237,0.3)" }}>
              {profile?.avatar_emoji ?? "🧑‍💻"}
            </div>
          </div>
        </div>
      </div>

      {/* 4-column grid */}
      <div className="cl-grid relative flex-1 min-h-0"
        style={{ display:"grid", gridTemplateRows:"100%", gap:"0", overflow:"hidden", zIndex:10 }}>

        {/* Left — 4 subject tiles */}
        <div className="cl-col-left">
          {LEFT_SUBJECTS.map(s => (
            <SubjectTile key={s.id} src={s.src} name={s.name} hasData={s.hasData} onClick={() => onEnter(s.id)} />
          ))}
        </div>

        {/* Center — transparent (shows background character) */}
        <div />

        {/* Right — 4 subject tiles */}
        <div className="cl-col-right">
          {RIGHT_SUBJECTS.map(s => (
            <SubjectTile key={s.id} src={s.src} name={s.name} hasData={s.hasData} onClick={() => onEnter(s.id)} />
          ))}
        </div>

        {/* Far right — leaderboard */}
        <div className="cl-leaderboard">
          <LeaderboardPanel />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type View = "landing" | "chapters" | "math-chapters" | "objective" | "arena" | "pick" | "select-type" | "loading"
          | "mcq-test" | "written-test" | "mcq-result" | "written-result"
          | "correct-notes" | "notes-result";

interface PaperData {
  paperId: string; questionIds: string[];
  questions: MCQQuestion[] | WrittenQuestion[];
  chapter: Chapter; type: "mcq" | "written";
}

const FADE = { initial:{opacity:0,y:10}, animate:{opacity:1,y:0}, exit:{opacity:0,y:-10}, transition:{duration:0.22} };

export default function ClassroomPage() {
  const [view,             setView]          = useState<View>("landing");
  const [selectedSubject,  setSelectedSubject] = useState<string | null>(null);
  const [profile,          setProfile]       = useState<Profile|null>(null);
  const [selectedChapter,setChapter]       = useState<Chapter|null>(null);
  const [paper,          setPaper]         = useState<PaperData|null>(null);
  const [mcqResult,      setMcqResult]     = useState<MCQResult|null>(null);
  const [writtenResult,    setWrittenResult]    = useState<WrittenResult|null>(null);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult|null>(null);
  const [loadError,        setLoadError]        = useState<string|null>(null);
  const [loadingMsg,     setLoadingMsg]    = useState("");
  const [activeSubject,  setActiveSubject] = useState<string>("chemistry");
  const [writtenPhase,   setWrittenPhase]  = useState("intro");

  useEffect(() => {
    fetch("/api/profile").then(r => r.ok ? r.json() : {profile:null})
      .then(({ profile: p }) => setProfile(p)).catch(() => {});
  }, []);

  const handleChapterSelect = (ch: Chapter) => { setChapter(ch); setLoadError(null); setView("select-type"); };

  const loadPaper = async (chapter: Chapter, type: "mcq"|"written") => {
    setView("loading");
    setLoadingMsg(type==="mcq" ? "Selecting 15 questions…" : "Loading question paper…");
    setLoadError(null);
    try {
      const res  = await fetch(`/api/classroom/paper?chapter_id=${chapter.id}&type=${type}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPaper({ paperId:data.paper_id, questionIds:data.question_ids??data.questions.map((q:any)=>q.id), questions:data.questions, chapter:data.chapter, type });
      setWrittenPhase("intro");
      setView(type==="mcq" ? "mcq-test" : "written-test");
    } catch (e: any) {
      setLoadError(e.message ?? "Failed to load."); setView("select-type");
    }
  };

  const handleTypeSelect      = (type:"mcq"|"written") => { if (selectedChapter) loadPaper(selectedChapter, type); };
  const handleMcqComplete     = (r: MCQResult)     => { setMcqResult(r);     setView("mcq-result"); };
  const handleWrittenComplete = (r: WrittenResult) => { setWrittenResult(r); setView("written-result"); };
  const retryMcq     = () => paper && loadPaper(paper.chapter, "mcq");
  const retryWritten = () => paper && loadPaper(paper.chapter, "written");

  const handleDisqualify = useCallback(() => {
    if (!paper) return;
    if (paper.type === "mcq") {
      const qs = paper.questions as MCQQuestion[];
      const fb: MCQResult["feedback"] = {};
      for (const q of qs) fb[q.id] = { correct:false, correct_index:-1, explanation:"Test terminated: proctoring violation." };
      setMcqResult({ score:0, max_score:qs.length, feedback:fb, questions:qs, answers:{} });
      setView("mcq-result");
    } else {
      const qs = paper.questions as WrittenQuestion[];
      const fb: Record<string, WrittenFeedbackItem> = {};
      for (const q of qs) fb[q.id] = { score:0, max:q.marks, feedback:"Test terminated: proctoring violation." };
      setWrittenResult({ score:0, max_score:qs.reduce((s,q)=>s+q.marks,0), feedback:fb, questions:qs });
      setView("written-result");
    }
  }, [paper]);

  const proctoringActive = view==="mcq-test" || (view==="written-test" && writtenPhase==="test");

  // Teacher panel — hidden during proctored tests so it can't be used as
  // a workaround channel by the student under exam conditions.
  const teacherHidden = proctoringActive;
  const teacher = (
    <TeacherCharacter
      profile={profile}
      hidden={teacherHidden}
      chapterTitle={selectedChapter?.chapter_title}
    />
  );

  // ── Landing view — full viewport, hub style ────────────────────────────────
  if (view === "landing") {
    return (
      <>
        <ClassroomLanding profile={profile} onEnter={(subjectId) => {
          setActiveSubject(subjectId);
          setView(subjectId === "mathematics" ? "math-chapters" : "chapters");
        }} />
        {teacher}
      </>
    );
  }

  // ── Chemistry chapter map — full viewport ────────────────────────────────
  if (view === "chapters") {
    return (
      <>
        <ChapterMapPage
          onChapterSelect={(ch) => { setChapter(ch); setView("objective"); }}
          onBack={() => setView("landing")}
        />
        {teacher}
      </>
    );
  }

  // ── Mathematics chapter map — full viewport ───────────────────────────────
  if (view === "math-chapters") {
    return (
      <>
        <MathChapterMapPage
          onChapterSelect={(ch) => { setChapter(ch); setView("objective"); }}
          onBack={() => setView("landing")}
        />
        {teacher}
      </>
    );
  }

  // ── Objective page — full viewport ────────────────────────────────────────
  if (view === "objective" && selectedChapter) {
    const chapterMapView = activeSubject === "mathematics" ? "math-chapters" : "chapters";
    return (
      <>
        <ObjectivePage
          chapter={selectedChapter}
          onSelectTest={(type) => loadPaper(selectedChapter, type)}
          onBack={() => setView(chapterMapView)}
          onEnterArena={() => setView("arena")}
          onCorrectNotes={() => setView("correct-notes")}
        />
        {teacher}
      </>
    );
  }

  // ── Classroom arena — full viewport ───────────────────────────────────────
  if (view === "arena" && selectedChapter) {
    return (
      <>
        <ClassroomArena
          chapter={selectedChapter}
          onBack={() => setView("objective")}
        />
        {teacher}
      </>
    );
  }

  // ── Correct Notes — glass panel (upload) ─────────────────────────────────
  if (view === "correct-notes" && selectedChapter) {
    return (
      <div className="flex flex-col"
        style={{ height:"100dvh", backgroundImage:"url('/classroom/background.png')",
          backgroundSize:"cover", backgroundPosition:"center", position:"relative" }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background:"linear-gradient(160deg,rgba(230,238,255,0.2),rgba(210,225,255,0.1))", zIndex:0 }} />
        <div className="flex-1 overflow-hidden flex relative z-10 py-4 px-4">
          <div className="flex-1 flex flex-col overflow-hidden max-w-xl mx-auto w-full rounded-3xl relative"
            style={{ background:"rgba(255,255,255,0.82)", border:"1px solid rgba(255,255,255,0.88)",
              backdropFilter:"blur(32px)", boxShadow:"0 8px 48px rgba(15,28,77,0.12), inset 0 1px 0 rgba(255,255,255,0.9)" }}>
            <div className="h-0.5 w-full flex-shrink-0 rounded-t-3xl"
              style={{ background:`linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.6) 30%, rgba(8,145,178,0.5) 70%, transparent 100%)` }} />
            <NotesUpload
              chapter={selectedChapter}
              onComplete={(r) => { setCorrectionResult(r); setView("notes-result"); }}
              onBack={() => setView("objective")}
            />
            <div className="h-0.5 w-full flex-shrink-0 rounded-b-3xl"
              style={{ background:`linear-gradient(90deg, transparent, rgba(6,182,212,0.3), transparent)` }} />
          </div>
        </div>
        {teacher}
      </div>
    );
  }

  // ── Notes Result — glass panel (correction report) ─────────────────────────
  if (view === "notes-result" && correctionResult && selectedChapter) {
    return (
      <div className="flex flex-col"
        style={{ height:"100dvh", backgroundImage:"url('/classroom/background.png')",
          backgroundSize:"cover", backgroundPosition:"center", position:"relative" }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background:"linear-gradient(160deg,rgba(230,238,255,0.2),rgba(210,225,255,0.1))", zIndex:0 }} />
        <div className="flex-1 overflow-hidden flex relative z-10 py-4 px-4">
          <div className="flex-1 flex flex-col overflow-hidden max-w-xl mx-auto w-full rounded-3xl"
            style={{ background:"rgba(255,255,255,0.82)", border:"1px solid rgba(255,255,255,0.88)",
              backdropFilter:"blur(32px)", boxShadow:"0 8px 48px rgba(15,28,77,0.12), inset 0 1px 0 rgba(255,255,255,0.9)" }}>
            <div className="h-0.5 w-full flex-shrink-0 rounded-t-3xl"
              style={{ background:`linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.6) 30%, rgba(8,145,178,0.5) 70%, transparent 100%)` }} />
            <CorrectionReport
              result={correctionResult}
              chapter={selectedChapter.chapter_title}
              onBack={() => setView("objective")}
            />
            <div className="h-0.5 w-full flex-shrink-0 rounded-b-3xl"
              style={{ background:`linear-gradient(90deg, transparent, rgba(6,182,212,0.3), transparent)` }} />
          </div>
        </div>
        {teacher}
      </div>
    );
  }

  // ── All other views — glass panel over classroom background ────────────────
  return (
    <div className="flex flex-col"
      style={{ height:"100dvh", backgroundImage:"url('/classroom/background.png')",
        backgroundSize:"cover", backgroundPosition:"center", position:"relative" }}>

      {/* Light overlay */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background:"linear-gradient(160deg,rgba(230,238,255,0.2),rgba(210,225,255,0.1))", zIndex:0 }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background:"radial-gradient(ellipse at center, transparent 30%, rgba(2,4,14,0.3) 100%)", zIndex:1 }} />

      <ProctoringGuard active={proctoringActive} onDisqualify={handleDisqualify}>
        <div className="flex-1 overflow-hidden flex relative z-10 py-4 px-4">
          <div className="flex-1 flex flex-col overflow-hidden max-w-xl mx-auto w-full rounded-3xl"
            style={{ background:"rgba(255,255,255,0.82)", border:"1px solid rgba(255,255,255,0.88)",
              backdropFilter:"blur(32px)", boxShadow:"0 8px 48px rgba(15,28,77,0.12), inset 0 1px 0 rgba(255,255,255,0.9)" }}>

            {/* Gold shimmer top */}
            <div className="h-0.5 w-full flex-shrink-0 rounded-t-3xl"
              style={{ background:`linear-gradient(90deg, transparent 0%, ${GOLD}60 30%, #2563eb60 70%, transparent 100%)` }} />

            <AnimatePresence mode="wait">

              {view === "pick" && (
                <motion.div key="pick" {...FADE} className="flex-1 overflow-y-auto px-5 pt-5 pb-3">
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <BookOpenCheck className="w-4 h-4" style={{ color:GOLD }} />
                      <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color:GOLD }}>Select a Chapter</span>
                    </div>
                    <p className="text-sm" style={{ color:`${NAVY}70` }}>
                      Each chapter has an MCQ test and a written exam.
                    </p>
                    {loadError && (
                      <div className="mt-3 text-xs px-3 py-2.5 rounded-xl"
                        style={{ background:"rgba(220,38,38,0.08)", color:"#dc2626", border:"1px solid rgba(220,38,38,0.2)" }}>
                        {loadError}
                      </div>
                    )}
                  </div>
                  <ChapterPicker onSelect={handleChapterSelect} />
                </motion.div>
              )}

              {view === "select-type" && selectedChapter && (
                <motion.div key="select-type" {...FADE} className="flex-1 overflow-hidden flex flex-col">
                  <TestTypeSelector chapter={selectedChapter} onSelect={handleTypeSelect}
                    onBack={() => { setView("pick"); setLoadError(null); }} />
                </motion.div>
              )}

              {view === "loading" && (
                <motion.div key="loading" {...FADE} className="flex-1 flex flex-col items-center justify-center gap-5">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background:`linear-gradient(135deg, rgba(200,168,75,0.15), rgba(37,99,235,0.08))`,
                        border:`1px solid rgba(200,168,75,0.3)`, boxShadow:`0 0 40px rgba(200,168,75,0.15)` }}>
                      <Loader2 className="w-7 h-7 animate-spin" style={{ color:GOLD }} />
                    </div>
                    <div className="absolute -inset-3 rounded-[28px] opacity-20 animate-pulse"
                      style={{ background:`radial-gradient(circle, rgba(200,168,75,0.4), transparent 70%)` }} />
                  </div>
                  <div className="text-center">
                    <p className="font-display font-bold text-sm" style={{ color:NAVY }}>Preparing your test</p>
                    <p className="text-xs mt-1 font-mono" style={{ color:`${NAVY}50` }}>{loadingMsg}</p>
                  </div>
                </motion.div>
              )}

              {view === "mcq-test" && paper && paper.type === "mcq" && (
                <motion.div key="mcq-test" {...FADE} className="flex-1 overflow-hidden flex flex-col">
                  <MCQTest paperId={paper.paperId} questionIds={paper.questionIds}
                    questions={paper.questions as MCQQuestion[]} chapter={paper.chapter}
                    onComplete={handleMcqComplete} onBack={() => setView("select-type")} />
                </motion.div>
              )}

              {view === "written-test" && paper && paper.type === "written" && (
                <motion.div key="written-test" {...FADE} className="flex-1 overflow-hidden flex flex-col">
                  <WrittenTest paperId={paper.paperId} questions={paper.questions as WrittenQuestion[]}
                    chapter={paper.chapter} onComplete={handleWrittenComplete}
                    onBack={() => setView("select-type")} onPhaseChange={setWrittenPhase} />
                </motion.div>
              )}

              {view === "mcq-result" && mcqResult && paper && (
                <motion.div key="mcq-result" {...FADE} className="flex-1 overflow-hidden flex flex-col">
                  <ScoreReport result={mcqResult} chapterTitle={paper.chapter.chapter_title}
                    onRetry={retryMcq} onHome={() => setView("landing")} />
                </motion.div>
              )}

              {view === "written-result" && writtenResult && paper && (
                <motion.div key="written-result" {...FADE} className="flex-1 overflow-hidden flex flex-col">
                  <WrittenScoreReport result={writtenResult} chapterTitle={paper.chapter.chapter_title}
                    onRetry={retryWritten} onHome={() => setView("landing")} />
                </motion.div>
              )}

            </AnimatePresence>

            <div className="h-0.5 w-full flex-shrink-0 rounded-b-3xl"
              style={{ background:`linear-gradient(90deg, transparent, rgba(200,168,75,0.3), transparent)` }} />
          </div>
        </div>
      </ProctoringGuard>
      {teacher}
    </div>
  );
}
