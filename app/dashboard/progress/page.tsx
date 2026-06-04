"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MoreHorizontal, Search, Plus, Folder, Star, Grid } from "lucide-react";
import Link from "next/link";
import { cn, formatDate, truncate } from "@/lib/utils";
import { AudioPlayer, type AudioData } from "@/components/playground/AudioPlayer";
import { SlideCarousel, type SlideData } from "@/components/playground/SlideCarousel";
import { getArena } from "@/lib/arenas";
import type { Creation, Project, OutputType, Profile } from "@/types";

const TYPE_META: Record<OutputType, { label: string; icon: string; color: string }> = {
  text:   { label: "Text",   icon: "T",   color: "border-blue-200 bg-blue-50 text-blue-600"       },
  json:   { label: "JSON",   icon: "{}",  color: "border-orange-200 bg-orange-50 text-orange-600" },
  image:  { label: "Image",  icon: "Img", color: "border-cyan-200 bg-cyan-50 text-cyan-600"       },
  audio:  { label: "Audio",  icon: "♪",   color: "border-pink-200 bg-pink-50 text-pink-600"       },
  slides: { label: "Slides", icon: "▦",   color: "border-purple-200 bg-purple-50 text-purple-600" },
  video:  { label: "Video",  icon: "▶",   color: "border-gray-200 bg-gray-50 text-gray-500"       },
};

export default function ProgressPage() {
  const [creations,      setCreations]      = useState<Creation[]>([]);
  const [projects,       setProjects]       = useState<Project[]>([]);
  const [activeFilter,   setActiveFilter]   = useState<string>("all");
  const [search,         setSearch]         = useState("");
  const [loading,        setLoading]        = useState(true);
  const [sort,           setSort]           = useState<"recent" | "oldest">("recent");
  const [newProjectName, setNewProjectName] = useState("");
  const [addingProject,  setAddingProject]  = useState(false);
  const [profile,        setProfile]        = useState<Profile | null>(null);

  useEffect(() => {
    fetch("/api/profile").then(r => r.ok ? r.json() : { profile: null })
      .then(({ profile }) => setProfile(profile)).catch(() => {});
  }, []);

  const arena = getArena(profile?.active_arena ?? 1);

  const fetchCreations = useCallback((filter = activeFilter, q = search, s = sort) => {
    const params = new URLSearchParams();
    if (filter === "unorganized")           params.set("project_id", "unorganized");
    else if (filter.startsWith("project:")) params.set("project_id", filter.replace("project:", ""));
    else if (filter !== "all" && filter !== "favourites") params.set("output_type", filter);
    if (q) params.set("search", q);

    fetch(`/api/creations?${params}`)
      .then(r => r.json())
      .then(({ creations }) => {
        let list: Creation[] = creations ?? [];
        if (filter === "favourites") list = list.filter(c => c.is_favourite);
        if (s === "oldest") list = [...list].reverse();
        setCreations(list);
        setLoading(false);
      });
  }, [activeFilter, search, sort]);

  const fetchProjects = useCallback(() => {
    fetch("/api/projects").then(r => r.json()).then(({ projects }) => setProjects(projects ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/creations").then(r => r.json()),
      fetch("/api/projects").then(r => r.json()),
    ]).then(([{ creations }, { projects }]) => {
      setCreations(creations ?? []);
      setProjects(projects ?? []);
      setLoading(false);
    });
  }, []); // eslint-disable-line

  useEffect(() => { fetchCreations(activeFilter, search, sort); }, [activeFilter, sort]); // eslint-disable-line

  const handleSearch = (q: string) => { setSearch(q); fetchCreations(activeFilter, q, sort); };

  const toggleFav = async (c: Creation) => {
    await fetch("/api/creations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, is_favourite: !c.is_favourite }),
    });
    setCreations(prev => prev.map(x => x.id === c.id ? { ...x, is_favourite: !x.is_favourite } : x));
  };

  const deleteCreation = async (id: string) => {
    await fetch("/api/creations", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setCreations(prev => prev.filter(c => c.id !== id));
  };

  const moveToProject = async (id: string, projectId: string) => {
    setCreations(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, project_id: projectId } : c);
      if (activeFilter.startsWith("project:")) {
        const pid = activeFilter.replace("project:", "");
        return updated.filter(c => c.project_id === pid);
      }
      if (activeFilter === "unorganized") return updated.filter(c => !c.project_id);
      return updated;
    });
    await fetch("/api/creations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, project_id: projectId }),
    });
    fetchCreations(activeFilter, search, sort);
    fetchProjects();
  };

  const createProject = async () => {
    if (!newProjectName.trim()) { setAddingProject(false); return; }
    const res = await fetch("/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName.trim() }),
    });
    const { project } = await res.json();
    if (project) setProjects(prev => [project, ...prev]);
    setNewProjectName(""); setAddingProject(false);
  };

  const navItems = [
    { id: "all",         label: "All Creations", icon: <Grid size={13}/> },
    { id: "unorganized", label: "Unorganized",   icon: <Folder size={13}/> },
    { id: "favourites",  label: "Favourites",    icon: <Star size={13}/> },
  ];

  return (
    <div className="relative flex min-h-0 flex-1" style={{ height: "100dvh", minHeight: 0, background: "linear-gradient(145deg, #F3F0FF 0%, #EDE9FE 35%, #F8F6FF 65%, #EEF2FF 100%)", fontFamily: "var(--font-inter, 'Inter', system-ui, sans-serif)" }}>

      {/* ── Left sidebar ── */}
      <aside
        className="relative z-10 hidden md:flex w-56 border-r flex-col py-5 flex-shrink-0"
        style={{
          background:     "rgba(255,255,255,0.85)",
          backdropFilter: "blur(24px)",
          borderColor:    "rgba(0,0,0,0.07)",
        }}
      >
        <div className="px-4 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(26,26,46,0.4)", fontFamily: "var(--font-inter)" }}>Library</p>
          <nav className="flex flex-col gap-1">
            {navItems.map(item => (
              <button key={item.id} onClick={() => setActiveFilter(item.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all text-left"
                style={activeFilter === item.id ? {
                  background: arena.accent,
                  color: "#fff",
                  boxShadow: `0 0 14px ${arena.accentGlow}`,
                } : { color: "rgba(26,26,46,0.5)" }}
                onMouseEnter={e => { if (activeFilter !== item.id) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.05)"; }}
                onMouseLeave={e => { if (activeFilter !== item.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="px-4 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.4)" }}>My Projects</p>
            <button onClick={() => setAddingProject(true)}
              className="w-5 h-5 rounded flex items-center justify-center transition-all"
              style={{ color: "rgba(26,26,46,0.4)" }}>
              <Plus size={12}/>
            </button>
          </div>

          {addingProject && (
            <input autoFocus value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") createProject();
                if (e.key === "Escape") { setAddingProject(false); setNewProjectName(""); }
              }}
              onBlur={createProject}
              placeholder="Project name…"
              className="w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none mb-2"
              style={{ background: "rgba(0,0,0,0.04)", border: `1px solid ${arena.accent}50`, color: "#1a1a2e" }}
            />
          )}

          <div className="flex flex-col gap-1">
            {projects.map((p) => (
              <button key={p.id} onClick={() => setActiveFilter(`project:${p.id}`)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-sm font-bold transition-all"
                style={activeFilter === `project:${p.id}` ? {
                  background: arena.accent, color: "#fff",
                  boxShadow: `0 0 12px ${arena.accentGlow}`,
                } : { color: "rgba(26,26,46,0.5)" }}
                onMouseEnter={e => { if (activeFilter !== `project:${p.id}`) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.05)"; }}
                onMouseLeave={e => { if (activeFilter !== `project:${p.id}`) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span className="flex items-center gap-2 truncate">
                  <Folder size={13} className="flex-shrink-0"/>
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1"
                  style={activeFilter === `project:${p.id}`
                    ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
                    : { background: "rgba(0,0,0,0.08)", color: "rgba(26,26,46,0.45)" }}>
                  {p.creation_count ?? 0}
                </span>
              </button>
            ))}
            {projects.length === 0 && !addingProject && (
              <p className="text-xs px-1 py-1" style={{ color: "rgba(26,26,46,0.3)" }}>No projects yet</p>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div className="border-b px-6 py-3 flex items-center gap-3 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.80)", backdropFilter: "blur(20px)", borderColor: "rgba(0,0,0,0.07)" }}>
          <div className="relative max-w-xs w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(26,26,46,0.35)" }}/>
            <input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Search your library..."
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none transition-all"
              style={{
                background: "rgba(0,0,0,0.04)", border: `1px solid ${search ? arena.accent + "60" : "rgba(0,0,0,0.10)"}`,
                color: "#1a1a2e",
              }}
            />
          </div>

          <button onClick={() => setAddingProject(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-all flex-shrink-0"
            style={{ border: "1px solid rgba(0,0,0,0.10)", color: "rgba(26,26,46,0.55)", background: "rgba(0,0,0,0.03)" }}>
            <Plus size={14}/> New Project
          </button>

          <div className="ml-auto">
            <select value={sort} onChange={e => setSort(e.target.value as "recent" | "oldest")}
              className="text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer"
              style={{ border: "1px solid rgba(0,0,0,0.10)", background: "rgba(0,0,0,0.03)", color: "rgba(26,26,46,0.6)" }}>
              <option value="recent">Recent First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Heading */}
        <div className="px-6 pt-5 pb-3 flex-shrink-0">
          <h1 className="font-black text-2xl" style={{ color: "#1a1a2e", fontFamily: "var(--font-nunito, 'Nunito', sans-serif)" }}>My Creations</h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(26,26,46,0.45)" }}>
            {loading ? "Loading…" : `${creations.length} creation${creations.length !== 1 ? "s" : ""} in your library`}
          </p>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="rounded-2xl h-52 animate-pulse"
                  style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(0,0,0,0.07)" }}/>
              ))}
            </div>
          ) : creations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-6xl mb-4 animate-float">🎨</div>
              <h3 className="font-black text-lg mb-1" style={{ color: "#1a1a2e" }}>Nothing here yet!</h3>
              <p className="text-sm max-w-sm" style={{ color: "rgba(26,26,46,0.5)" }}>Save AI responses from the playground to build your library.</p>
              <Link href="/dashboard/playground"
                className="mt-6 inline-flex items-center justify-center font-extrabold text-sm px-6 py-3 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.97]"
                style={{ background: arena.accent, color: "#fff", boxShadow: `0 0 24px ${arena.accentGlow}` }}>
                Open Creators Room
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {creations.map((creation, i) => (
                <CreationCard key={creation.id} creation={creation} index={i}
                  projects={projects}
                  onToggleFav={() => toggleFav(creation)}
                  onDelete={() => deleteCreation(creation.id)}
                  onMoveToProject={(pid) => moveToProject(creation.id, pid)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="text-center py-3 text-xs border-t"
          style={{ background: "rgba(255,255,255,0.70)", borderColor: "rgba(0,0,0,0.07)", color: "rgba(26,26,46,0.35)" }}>
          Keep creating! Every interaction is a step toward mastering AI.
        </div>
      </div>
    </div>
  );
}

// ─── Creation Preview ─────────────────────────────────────────────────────────
function CreationPreview({ creation }: { creation: Creation }) {
  const { output_type, content } = creation;
  if (output_type === "image" && /^https?:\/\//i.test(content.trim())) {
    return (
      <div className="flex-1 overflow-hidden">
        <img src={content.trim()} alt={creation.title} className="w-full h-full object-cover"/>
      </div>
    );
  }
  if (output_type === "audio") {
    try {
      const data = JSON.parse(content) as AudioData;
      if (data?.url) return (
        <div className="flex-1 flex items-center px-2 py-1 overflow-hidden scale-90 origin-top">
          <div className="w-full"><AudioPlayer data={data}/></div>
        </div>
      );
    } catch { /* fall through */ }
  }
  if (output_type === "slides") {
    try {
      const data = JSON.parse(content) as SlideData;
      if (data?.sections) return (
        <div className="flex-1 w-full overflow-hidden" style={{ position: "relative", minHeight: 0 }}>
          <div className="origin-top-left" style={{ width: "122%", transform: "scale(0.82)" }}>
            <SlideCarousel data={data}/>
          </div>
        </div>
      );
    } catch { /* fall through */ }
  }
  return (
    <p className="text-xs leading-relaxed line-clamp-3 p-1" style={{ color: "rgba(26,26,46,0.45)" }}>
      {truncate(content.replace(/[#*`]/g, ""), 140)}
    </p>
  );
}

// ─── Creation Card ────────────────────────────────────────────────────────────
function CreationCard({
  creation, index, projects, onToggleFav, onDelete, onMoveToProject,
}: {
  creation: Creation; index: number; projects: Project[];
  onToggleFav: () => void; onDelete: () => void;
  onMoveToProject: (pid: string) => void;
}) {
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [moveOpen,   setMoveOpen]   = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const meta = TYPE_META[creation.output_type] ?? TYPE_META.text;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false); setMoveOpen(false); setProjSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projSearch.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group relative hover:-translate-y-0.5"
      style={{
        background:     "rgba(255,255,255,0.92)",
        border:         "1px solid rgba(0,0,0,0.07)",
        backdropFilter: "blur(16px)",
        boxShadow:      "0 2px 12px rgba(0,0,0,0.07)",
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.12)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)"}
    >
      {/* Preview area */}
      <div className="min-h-36 border-b p-3 flex flex-col gap-2 relative rounded-t-2xl overflow-hidden"
        style={{ background: "rgba(0,0,0,0.02)", borderColor: "rgba(0,0,0,0.07)" }}>
        {/* Type badge + menu */}
        <div className="flex items-center justify-between p-1 flex-shrink-0">
          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border", meta.color)}>
            <span className="font-mono">{meta.icon}</span> {meta.label}
          </span>

          <div className="relative" ref={menuRef}>
            <button onClick={() => { setMenuOpen(!menuOpen); setMoveOpen(false); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all opacity-0 group-hover:opacity-100"
              style={{ border: "1px solid rgba(0,0,0,0.10)", background: "rgba(0,0,0,0.04)", color: "rgba(26,26,46,0.5)" }}>
              <MoreHorizontal size={14}/>
            </button>

            <AnimatePresence>
              {menuOpen && !moveOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1 rounded-xl py-1 z-50 w-48"
                  style={{ background: "rgba(255,255,255,0.97)", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 8px 32px rgba(0,0,0,0.14)", backdropFilter: "blur(16px)" }}>
                  <button onClick={() => { navigator.clipboard.writeText(creation.content); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold transition-colors hover:bg-black/[0.04]"
                    style={{ color: "rgba(26,26,46,0.65)" }}>
                    Copy content
                  </button>
                  <button onClick={() => setMoveOpen(true)}
                    className="w-full text-left px-3 py-2 text-xs font-semibold transition-colors hover:bg-black/[0.04] flex items-center justify-between"
                    style={{ color: "rgba(26,26,46,0.65)" }}>
                    <span className="flex items-center gap-2"><Folder size={12}/> Move to project</span>
                    <span style={{ color: "rgba(26,26,46,0.25)" }}>›</span>
                  </button>
                  <div className="border-t mt-1 pt-1" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
                    <button onClick={() => { onDelete(); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
                      Delete
                    </button>
                  </div>
                </motion.div>
              )}

              {menuOpen && moveOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1 rounded-xl z-50 w-56"
                  style={{ background: "rgba(255,255,255,0.97)", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 8px 32px rgba(0,0,0,0.14)", backdropFilter: "blur(16px)" }}>
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
                    <button onClick={() => setMoveOpen(false)} style={{ color: "rgba(26,26,46,0.35)" }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <span className="text-xs font-bold" style={{ color: "rgba(26,26,46,0.6)" }}>Move to project</span>
                  </div>
                  <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
                    <div className="relative">
                      <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "rgba(26,26,46,0.35)" }}/>
                      <input autoFocus value={projSearch} onChange={e => setProjSearch(e.target.value)}
                        placeholder="Search projects..."
                        className="w-full pl-6 pr-2 py-1.5 text-xs rounded-lg focus:outline-none"
                        style={{ border: "1px solid rgba(0,0,0,0.10)", background: "rgba(0,0,0,0.03)", color: "#1a1a2e" }}/>
                    </div>
                  </div>
                  <div className="py-1 max-h-40 overflow-y-auto">
                    <button onClick={() => { onMoveToProject(""); setMenuOpen(false); setMoveOpen(false); setProjSearch(""); }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold transition-colors hover:bg-black/[0.04] flex items-center gap-2"
                      style={{ color: "rgba(26,26,46,0.55)" }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "rgba(0,0,0,0.07)" }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      Move to My Creations
                    </button>
                    {filteredProjects.map(p => (
                      <button key={p.id} onClick={() => { onMoveToProject(p.id); setMenuOpen(false); setMoveOpen(false); setProjSearch(""); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold transition-colors hover:bg-black/[0.04] flex items-center gap-2"
                        style={{ color: "rgba(26,26,46,0.55)" }}>
                        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "rgba(124,58,237,0.1)" }}>
                          <Folder size={10} style={{ color: "#7C3AED" }}/>
                        </div>
                        {p.name}
                        <span className="ml-auto text-[10px]" style={{ color: "rgba(26,26,46,0.3)" }}>{p.creation_count ?? 0}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <CreationPreview creation={creation}/>
      </div>

      {/* Footer */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-sm leading-snug truncate" style={{ color: "#1a1a2e", fontFamily: "var(--font-nunito)" }}>{creation.title}</h3>
          <button onClick={onToggleFav}
            className={cn("flex-shrink-0 transition-all mt-0.5",
              creation.is_favourite ? "text-red-400" : "hover:text-red-400")}
            style={{ color: creation.is_favourite ? undefined : "rgba(26,26,46,0.2)" }}>
            <Heart size={14} fill={creation.is_favourite ? "currentColor" : "none"}/>
          </button>
        </div>
        <p className="text-[10px] mb-2" style={{ color: "rgba(26,26,46,0.35)" }}>{formatDate(creation.created_at)}</p>
        {creation.prompt_used && (
          <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.07)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "rgba(26,26,46,0.3)" }}>Prompt</p>
            <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: "rgba(26,26,46,0.45)" }}>
              {truncate(creation.prompt_used, 80)}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
