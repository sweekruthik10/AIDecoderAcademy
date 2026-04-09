"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { OutputType, Project } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (title: string, outputType: OutputType, tags: string[], projectId?: string) => Promise<void>;
  defaultOutputType: OutputType;
  suggestedTitle?: string;
}

const SUGGESTED_TAGS = ["Sci-Fi","Space","Robot","Nature","Fantasy","Code","Math","Art","Story","Quiz","Science"];

export function SaveCreationModal({ open, onClose, onSave, defaultOutputType, suggestedTitle = "" }: Props) {
  const [title,      setTitle]      = useState(suggestedTitle);
  const [tags,       setTags]       = useState<string[]>([]);
  const [projectId,  setProjectId]  = useState<string>("");
  const [newTag,     setNewTag]     = useState("");
  const [addingTag,  setAddingTag]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [projects,   setProjects]   = useState<Project[]>([]);
  const [newProject, setNewProject] = useState("");
  const [addingProj, setAddingProj] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(suggestedTitle);
      fetch("/api/projects").then(r => r.json()).then(({ projects }) => setProjects(projects ?? []));
    }
  }, [open, suggestedTitle]);

  const toggleTag = (tag: string) =>
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  const addCustomTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setNewTag(""); setAddingTag(false);
  };

  const createProject = async () => {
    if (!newProject.trim()) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProject.trim() }),
    });
    const { project } = await res.json();
    if (project) {
      setProjects((prev) => [project, ...prev]);
      setProjectId(project.id);
    }
    setNewProject(""); setAddingProj(false);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave(title.trim(), defaultOutputType, tags, projectId || undefined);
    setSaving(false);
    setTitle(""); setTags([]); setProjectId("");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md z-10"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h3 className="text-lg font-black text-[#1a1a2e]">Save to My Creations</h3>
              <button onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-all">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="px-6 pb-6 space-y-4">
              {/* Title */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Title</label>
                <input
                  value={title} onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  placeholder="Give your creation a name…"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-[#1a1a2e] bg-white focus:outline-none focus:border-[#6C47FF] focus:ring-2 focus:ring-purple-100 transition-all placeholder:text-slate-300"
                />
              </div>

              {/* Output type badge */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Type:</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#EEF0FF] text-[#6C47FF] border border-purple-200">
                  {defaultOutputType === "json"   ? "{ } JSON"
                   : defaultOutputType === "image"  ? "🖼 Image"
                   : defaultOutputType === "audio"  ? "♪ Audio"
                   : defaultOutputType === "slides" ? "▦ Slides"
                   : defaultOutputType === "video"  ? "▶ Video"
                   : "T Text"}
                </span>
              </div>

              {/* Project */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                  Assign to project
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setProjectId("")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      projectId === "" ? "bg-[#6C47FF] text-white border-[#6C47FF]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    None
                  </button>
                  {projects.map((p) => (
                    <button key={p.id} onClick={() => setProjectId(p.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        projectId === p.id ? "bg-[#6C47FF] text-white border-[#6C47FF]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}>
                      {p.name}
                    </button>
                  ))}
                  {addingProj ? (
                    <input autoFocus value={newProject}
                      onChange={(e) => setNewProject(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") createProject(); if (e.key === "Escape") setAddingProj(false); }}
                      onBlur={createProject}
                      placeholder="Project name…"
                      className="px-3 py-1 rounded-xl text-xs border border-[#6C47FF] text-[#6C47FF] bg-white focus:outline-none w-28"
                    />
                  ) : (
                    <button onClick={() => setAddingProj(true)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:border-[#6C47FF] hover:text-[#6C47FF] transition-all">
                      + New Project
                    </button>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_TAGS.map((tag) => (
                    <button key={tag} onClick={() => toggleTag(tag)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        tags.includes(tag) ? "bg-[#EEF0FF] border-[#6C47FF] text-[#6C47FF]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}>
                      {tags.includes(tag) && "✓ "}{tag}
                    </button>
                  ))}
                  {tags.filter(t => !SUGGESTED_TAGS.includes(t)).map((tag) => (
                    <button key={tag} onClick={() => toggleTag(tag)}
                      className="px-3 py-1 rounded-full text-xs font-semibold border bg-[#EEF0FF] border-[#6C47FF] text-[#6C47FF]">
                      ✓ {tag}
                    </button>
                  ))}
                  {addingTag ? (
                    <input autoFocus value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addCustomTag(); if (e.key === "Escape") setAddingTag(false); }}
                      onBlur={addCustomTag}
                      placeholder="Tag…"
                      className="px-3 py-1 rounded-full text-xs border border-[#6C47FF] text-[#6C47FF] focus:outline-none w-20"
                    />
                  ) : (
                    <button onClick={() => setAddingTag(true)}
                      className="px-3 py-1 rounded-full text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:border-[#6C47FF] hover:text-[#6C47FF] transition-all">
                      + Add
                    </button>
                  )}
                </div>
              </div>

              <button onClick={handleSave} disabled={!title.trim() || saving}
                className="w-full bg-[#6C47FF] hover:bg-[#5538ee] text-white font-bold py-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-purple-200">
                {saving ? "Saving…" : "Save to My Creations"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}