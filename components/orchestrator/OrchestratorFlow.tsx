/**
 * OrchestratorFlow — Premium full-screen content creation experience.
 *
 * A self-contained overlay that replaces the old modal-wrapped wizard.
 * Preserves all business logic: persistent session ID, SSE, localStorage.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
  Image as ImageIcon,
  Globe,
  AlertCircle,
  RotateCcw,
  Search,
  Sparkles,
  X,
  Copy,
  Zap,
} from "lucide-react";
import {
  startOrchestrator,
  getOrchestratorSession,
  editPlan,
  submitSelections,
  resetSession,
  type OrchestratorSession,
  type SubTask,
  type OrchestratorPhase,
} from "../../services/orchestrator";
import { getSSEManager } from "../../services/sse";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY_PREFIX = "orch_session_";

function getStoredSessionId(id: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
  } catch {
    return null;
  }
}
function storeSessionId(id: string, sid: string) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, sid);
  } catch {}
}
function clearStoredSessionId(id: string) {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${id}`);
  } catch {}
}
function generateSessionId(): string {
  return (
    crypto.randomUUID?.() ??
    `orch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
}

function phaseToStep(phase: OrchestratorPhase): number {
  switch (phase) {
    case "planning":
      return 1;
    case "plan_review":
      return 2;
    case "research":
      return 2;
    case "selection":
      return 3;
    case "generation":
      return 3;
    case "complete":
      return 4;
    case "error":
      return 1;
    default:
      return 1;
  }
}
function phaseIsLoading(phase: OrchestratorPhase): boolean {
  return ["planning", "research", "generation"].includes(phase);
}

const STEPS = [
  { label: "Describe", icon: Sparkles },
  { label: "Plan", icon: Search },
  { label: "Curate", icon: ImageIcon },
  { label: "Result", icon: Check },
] as const;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** Animated pulsing ring used during loading / restore */
const PulseRing: React.FC<{ size?: number }> = ({ size = 48 }) => (
  <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
    <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
    <div className="absolute inset-2 rounded-full bg-indigo-500/30 animate-pulse" />
    <Sparkles size={size * 0.4} className="text-indigo-400 relative z-10" />
  </div>
);

/** Horizontal stepper rendered in the top bar */
const Stepper: React.FC<{ current: number }> = ({ current }) => (
  <nav className="flex items-center gap-0.5 sm:gap-1.5">
    {STEPS.map((s, i) => {
      const step = i + 1;
      const done = current > step;
      const active = current === step;
      const Icon = s.icon;
      return (
        <React.Fragment key={step}>
          {/* connector line */}
          {i > 0 && (
            <div
              className={`hidden sm:block w-5 lg:w-8 h-0.5 rounded-full transition-colors duration-500 ${
                done ? "bg-indigo-500" : "bg-white/6"
              }`}
            />
          )}
          <div
            className={`
              flex items-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-full text-xs font-medium
              transition-all duration-300 select-none
              ${active ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,.15)]" : ""}
              ${done ? "text-emerald-400" : ""}
              ${!active && !done ? "text-gray-600" : ""}
            `}
          >
            <div
              className={`
                w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                transition-all duration-300
                ${done ? "bg-emerald-500/20" : active ? "bg-indigo-500/25" : "bg-white/4"}
              `}
            >
              {done ? <Check size={10} /> : <Icon size={10} />}
            </div>
            <span className="hidden sm:inline tracking-wide">{s.label}</span>
          </div>
        </React.Fragment>
      );
    })}
  </nav>
);

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface OrchestratorFlowProps {
  influencerId: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (postData: any) => void;
}

export const OrchestratorFlow: React.FC<OrchestratorFlowProps> = ({
  influencerId,
  isOpen,
  onClose,
  onComplete,
}) => {
  /* ── state ── */
  const [sessionId, setSessionId] = useState<string>(
    () => getStoredSessionId(influencerId) ?? generateSessionId(),
  );
  const [currentStep, setCurrentStep] = useState(1);
  const [session, setSession] = useState<OrchestratorSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);

  // Step 1
  const [query, setQuery] = useState("");
  const [postTypeHint, setPostTypeHint] = useState("");

  // Step 2
  const [editingPlan, setEditingPlan] = useState<SubTask[]>([]);

  // Step 3
  const [selectedWebIds, setSelectedWebIds] = useState<Set<string>>(new Set());
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());

  // Clipboard toast
  const [copiedCaption, setCopiedCaption] = useState(false);

  const unsubRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to top on step change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  /* ── SSE ── */
  const refreshSession = useCallback(async () => {
    try {
      setSession(await getOrchestratorSession(sessionId));
    } catch {}
  }, [sessionId]);

  const handleSSE = useCallback(
    (event: any, eventType: string) => {
      const data = event?.data ?? event;
      switch (eventType) {
        case "orch_planning":
          setStatusMsg(data?.message ?? "Planning research…");
          break;
        case "orch_plan_ready":
          refreshSession();
          setCurrentStep(2);
          setLoading(false);
          setStatusMsg(null);
          break;
        case "orch_researching":
          setStatusMsg(data?.message ?? "Searching the web…");
          break;
        case "orch_research_ready":
          refreshSession();
          setCurrentStep(3);
          setLoading(false);
          setStatusMsg(null);
          break;
        case "orch_generating":
          setStatusMsg(data?.message ?? "Generating your post…");
          break;
        case "orch_post_ready":
          refreshSession();
          setCurrentStep(4);
          setLoading(false);
          setStatusMsg(null);
          if (onComplete && data?.slide_urls) onComplete(data);
          break;
        case "orch_error":
          setError(data?.message || "Something went wrong");
          setLoading(false);
          setStatusMsg(null);
          break;
      }
    },
    [onComplete, refreshSession],
  );

  useEffect(() => {
    const channel = `orchestrator:${sessionId}`;
    unsubRef.current = getSSEManager().subscribe(channel, handleSSE);
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [sessionId, handleSSE]);

  /* ── Restore session on mount ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = getStoredSessionId(influencerId);
      if (!stored) {
        setRestoringSession(false);
        return;
      }
      try {
        const existing = await getOrchestratorSession(stored);
        if (cancelled) return;
        setSession(existing);
        setSessionId(stored);
        setQuery(existing.query || "");
        setPostTypeHint(existing.post_type_hint || "");
        setCurrentStep(phaseToStep(existing.phase));
        setLoading(phaseIsLoading(existing.phase));
        if (existing.research_plan) setEditingPlan(existing.research_plan);
      } catch {
        clearStoredSessionId(influencerId);
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [influencerId]);

  // Keep editingPlan in sync
  useEffect(() => {
    if (session?.research_plan) setEditingPlan(session.research_plan);
  }, [session?.research_plan]);

  /* ── Actions ── */
  const handleReset = async () => {
    unsubRef.current?.();
    unsubRef.current = null;
    try {
      await resetSession(sessionId);
    } catch {}
    const newId = generateSessionId();
    clearStoredSessionId(influencerId);
    storeSessionId(influencerId, newId);
    setSessionId(newId);
    setSession(null);
    setCurrentStep(1);
    setQuery("");
    setPostTypeHint("");
    setEditingPlan([]);
    setSelectedWebIds(new Set());
    setSelectedImageIds(new Set());
    setError(null);
    setLoading(false);
    setStatusMsg(null);
  };

  const handleStart = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      storeSessionId(influencerId, sessionId);
      const r = await startOrchestrator({
        influencer_id: influencerId,
        query: query.trim(),
        post_type_hint: postTypeHint || undefined,
        session_id: sessionId,
      });
      setSession(await getOrchestratorSession(r.session_id));
    } catch (e: any) {
      setError(e.message || "Failed to start");
      setLoading(false);
    }
  };

  const handleEditPlan = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      await editPlan(session.session_id, {
        research_plan: editingPlan.map((t) => ({
          id: t.id,
          name: t.name,
          queries: t.queries,
        })),
      });
    } catch (e: any) {
      setError(e.message || "Failed to start research");
      setLoading(false);
    }
  };

  const handleSubmitSelections = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      await submitSelections(session.session_id, {
        web_item_ids: Array.from(selectedWebIds),
        image_ids: Array.from(selectedImageIds),
      });
    } catch (e: any) {
      setError(e.message || "Failed to submit selections");
      setLoading(false);
    }
  };

  const toggleIn = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  };

  const addSubTask = () =>
    setEditingPlan([
      ...editingPlan,
      { id: `t-${Date.now()}`, name: "", queries: [""], status: "pending" },
    ]);
  const removeSubTask = (id: string) =>
    setEditingPlan(editingPlan.filter((t) => t.id !== id));
  const updateSubTask = (id: string, u: Partial<SubTask>) =>
    setEditingPlan(editingPlan.map((t) => (t.id === id ? { ...t, ...u } : t)));

  const copyCaption = () => {
    if (session?.generated_post?.caption) {
      navigator.clipboard?.writeText(session.generated_post.caption);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    }
  };

  const POST_TYPES = ["Tutorial", "Review", "Comparison", "News", "Guide", "How-to"];

  /* ── Bail out if not visible ── */
  if (!isOpen) return null;

  /* ── Full-screen overlay ── */
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-white orch-fade-in">
      {/* ═══════════════ Top bar ═══════════════ */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 h-14 sm:h-16 border-b border-white/5 bg-background/80 backdrop-blur-xl relative z-10">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-xl hover:bg-white/5 active:scale-95 transition-all"
          aria-label="Close"
        >
          <X size={20} className="text-gray-400" />
        </button>

        <Stepper current={currentStep} />

        {session || currentStep > 1 ? (
          <button
            onClick={handleReset}
            className="p-2 -mr-2 rounded-xl hover:bg-white/5 active:scale-95 transition-all text-gray-400 hover:text-white"
            title="Start over"
          >
            <RotateCcw size={18} />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </header>

      {/* ═══════════════ Scrollable body ═══════════════ */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        {/* Restoring spinner */}
        {restoringSession ? (
          <div className="flex items-center justify-center h-full min-h-[60vh]">
            <PulseRing size={56} />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-6 pb-32 sm:pb-10">
            {/* ── Error banner ── */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/8 border border-red-500/20 orch-slide-up">
                <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-red-300 leading-relaxed">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="mt-1.5 text-xs text-red-400/60 hover:text-red-300 underline underline-offset-2 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════ STEP 1 — Describe ═══════════════ */}
            {currentStep === 1 && !loading && (
              <div className="flex flex-col gap-8 orch-slide-up">
                {/* Hero */}
                <div className="text-center pt-6 sm:pt-14">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-indigo-500/20 via-purple-500/15 to-blue-500/20 ring-1 ring-indigo-500/20 mb-6 orch-scale-in">
                    <Sparkles size={28} className="text-indigo-400" />
                  </div>
                  <h1 className="text-2xl sm:text-4xl font-bold tracking-tight font-display bg-linear-to-b from-white to-gray-400 bg-clip-text text-transparent">
                    What should we create?
                  </h1>
                  <p className="mt-3 text-sm sm:text-base text-gray-500 max-w-md mx-auto leading-relaxed">
                    Describe your idea and our AI will research, plan, and generate a stunning post.
                  </p>
                </div>

                {/* Input card */}
                <div className="rounded-2xl bg-white/2.5 border border-white/6 p-5 sm:p-7 flex flex-col gap-5 shadow-2xl shadow-black/40">
                  <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g., Best hidden coffee shops in Tokyo for a travel-food post…"
                    rows={4}
                    className="w-full resize-none bg-transparent text-white placeholder-gray-600 text-sm sm:text-base leading-relaxed focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleStart();
                    }}
                  />

                  {/* Type chips */}
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-gray-600 mb-2.5 font-medium">
                      Post Type
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {POST_TYPES.map((t) => (
                        <button
                          key={t}
                          onClick={() => setPostTypeHint(postTypeHint === t ? "" : t)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200
                            ${
                              postTypeHint === t
                                ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40 shadow-[0_0_8px_rgba(99,102,241,.12)]"
                                : "bg-white/4 text-gray-500 hover:bg-white/8 hover:text-gray-300"
                            }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  <button
                    onClick={handleStart}
                    disabled={!query.trim()}
                    className="group relative w-full py-3.5 sm:py-4 rounded-xl font-semibold text-sm overflow-hidden
                      disabled:opacity-30 disabled:cursor-not-allowed
                      bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                      active:scale-[.98] shadow-lg shadow-indigo-500/25 transition-all duration-200"
                  >
                    <span className="flex items-center justify-center gap-2">
                      Start Research
                      <ArrowRight
                        size={16}
                        className="group-hover:translate-x-0.5 transition-transform"
                      />
                    </span>
                  </button>

                  <p className="text-[11px] text-gray-700 text-center">
                    Press{" "}
                    <kbd className="px-1.5 py-0.5 rounded bg-white/4 text-gray-500 font-mono text-[10px]">
                      ⌘ Enter
                    </kbd>{" "}
                    to start
                  </p>
                </div>
              </div>
            )}

            {/* ═══════════════ STEP 2 — Plan Review ═══════════════ */}
            {currentStep === 2 && session && !loading && (
              <div className="flex flex-col gap-6 orch-slide-up">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight font-display">
                    Research Plan
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
                    Edit tasks and search queries, then kick off the research.
                  </p>
                </div>

                {/* Task cards */}
                <div className="flex flex-col gap-3">
                  {editingPlan.map((task, idx) => (
                    <div
                      key={task.id}
                      className="group rounded-2xl bg-white/2.5 border border-white/6 hover:border-white/10 transition-all duration-200 p-4 sm:p-5 flex flex-col gap-3 orch-slide-up"
                      style={{ animationDelay: `${idx * 70}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center text-xs font-bold mt-0.5">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={task.name}
                          onChange={(e) => updateSubTask(task.id, { name: e.target.value })}
                          placeholder="Task name…"
                          className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-gray-600 focus:outline-none"
                        />
                        <button
                          onClick={() => removeSubTask(task.id)}
                          className="p-1.5 rounded-lg text-gray-700 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="pl-10 flex flex-wrap gap-2">
                        {task.queries.map((q, qi) => (
                          <div
                            key={qi}
                            className="flex items-center gap-1.5 bg-white/3 rounded-lg px-3 py-2 ring-1 ring-white/6 focus-within:ring-indigo-500/40 transition-all"
                          >
                            <Search size={12} className="text-gray-600 shrink-0" />
                            <input
                              type="text"
                              value={q}
                              onChange={(e) => {
                                const nq = [...task.queries];
                                nq[qi] = e.target.value;
                                updateSubTask(task.id, { queries: nq });
                              }}
                              placeholder="Search query…"
                              className="bg-transparent text-xs sm:text-sm text-white placeholder-gray-600 focus:outline-none w-28 sm:w-44"
                            />
                          </div>
                        ))}
                        <button
                          onClick={() =>
                            updateSubTask(task.id, { queries: [...task.queries, ""] })
                          }
                          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs text-indigo-400/60 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                        >
                          <Plus size={12} /> Query
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add task */}
                <button
                  onClick={addSubTask}
                  className="w-full py-3.5 rounded-2xl border border-dashed border-white/8 text-sm text-gray-600 hover:text-gray-300 hover:border-white/15 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Add research task
                </button>

                {/* CTA */}
                <button
                  onClick={handleEditPlan}
                  className="w-full py-3.5 sm:py-4 rounded-xl font-semibold text-sm
                    bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                    active:scale-[.98] shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
                >
                  Run Research <ArrowRight size={16} />
                </button>
              </div>
            )}

            {/* ═══════════════ STEP 3 — Curate ═══════════════ */}
            {currentStep === 3 && session && !loading && (
              <div className="flex flex-col gap-6 orch-slide-up">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight font-display">
                      Curate Content
                    </h2>
                    <p className="mt-1.5 text-sm text-gray-500">
                      Pick the best images and sources for your post.
                    </p>
                  </div>
                  <div className="shrink-0 px-3 py-1.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold ring-1 ring-indigo-500/20">
                    {selectedImageIds.size + selectedWebIds.size} selected
                  </div>
                </div>

                {/* Results by sub-task */}
                {session.research_plan.map((subTask) => {
                  const results = session.research_results[subTask.id];
                  if (!results) return null;
                  const hasImages = results.images && results.images.length > 0;
                  const hasWeb = results.web_items && results.web_items.length > 0;
                  if (!hasImages && !hasWeb) return null;

                  return (
                    <section key={subTask.id} className="flex flex-col gap-4">
                      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 ring-2 ring-indigo-500/20" />
                        {subTask.name}
                      </h3>

                      {/* Image grid */}
                      {hasImages && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-2.5">
                          {results.images.map((img) => {
                            const sel = selectedImageIds.has(img.id);
                            return (
                              <button
                                key={img.id}
                                onClick={() =>
                                  setSelectedImageIds(toggleIn(selectedImageIds, img.id))
                                }
                                className={`relative aspect-square rounded-xl overflow-hidden group transition-all duration-200
                                  ${
                                    sel
                                      ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-background scale-[.97]"
                                      : "hover:ring-1 hover:ring-white/20"
                                  }`}
                              >
                                <img
                                  src={img.thumbnail}
                                  alt={img.title}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  loading="lazy"
                                />
                                <div
                                  className={`absolute inset-0 transition-all duration-200 ${
                                    sel
                                      ? "bg-indigo-500/20"
                                      : "bg-black/0 group-hover:bg-black/30"
                                  }`}
                                />
                                {sel && (
                                  <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg orch-scale-in">
                                    <Check size={10} className="text-white" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Web results */}
                      {hasWeb && (
                        <div className="flex flex-col gap-1.5">
                          {results.web_items.map((item) => {
                            const sel = selectedWebIds.has(item.id);
                            return (
                              <button
                                key={item.id}
                                onClick={() =>
                                  setSelectedWebIds(toggleIn(selectedWebIds, item.id))
                                }
                                className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-start gap-3
                                  ${
                                    sel
                                      ? "bg-indigo-500/8 ring-1 ring-indigo-500/25"
                                      : "bg-white/1.5 hover:bg-white/4"
                                  }`}
                              >
                                {/* checkbox */}
                                <div
                                  className={`mt-0.5 w-4 h-4 rounded-[5px] border shrink-0 flex items-center justify-center transition-all duration-200
                                    ${
                                      sel
                                        ? "bg-indigo-500 border-indigo-500 shadow-[0_0_6px_rgba(99,102,241,.3)]"
                                        : "border-gray-700"
                                    }`}
                                >
                                  {sel && <Check size={10} className="text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-white/90 truncate">
                                    {item.title}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                    {item.snippet}
                                  </p>
                                </div>
                                <Globe size={12} className="text-gray-700 mt-1 shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}

                {/* Sticky generate bar */}
                <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-4 bg-linear-to-t from-background via-background/95 to-transparent mt-2">
                  <button
                    onClick={handleSubmitSelections}
                    disabled={selectedImageIds.size === 0 && selectedWebIds.size === 0}
                    className="w-full py-3.5 sm:py-4 rounded-xl font-semibold text-sm
                      disabled:opacity-25 disabled:cursor-not-allowed
                      bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                      active:scale-[.98] shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
                  >
                    Generate Post <Sparkles size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════ STEP 4 — Result ═══════════════ */}
            {currentStep === 4 && session?.generated_post && !loading && (
              <div className="flex flex-col gap-8 orch-slide-up">
                {/* Success hero */}
                <div className="text-center pt-4 sm:pt-10">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/20 mb-5 orch-scale-in">
                    <Check size={28} className="text-emerald-400" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display bg-linear-to-b from-white to-gray-400 bg-clip-text text-transparent">
                    Your post is ready
                  </h2>
                  <p className="mt-2 text-sm text-gray-500">
                    {session.generated_post.slide_count} slides ·{" "}
                    {session.generated_post.grid_layout} layout
                  </p>
                </div>

                {/* Slides */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {session.generated_post.slide_urls.map((url, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-2xl overflow-hidden bg-white/3 ring-1 ring-white/6 orch-slide-up"
                      style={{ animationDelay: `${i * 120}ms` }}
                    >
                      <img
                        src={url}
                        alt={`Slide ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>

                {/* Caption */}
                <div className="rounded-2xl bg-white/2.5 border border-white/6 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                    <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                      Caption
                    </h3>
                    <button
                      onClick={copyCaption}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {copiedCaption ? (
                        <>
                          <Check size={12} className="text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap px-5 py-4">
                    {session.generated_post.caption}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    className="flex-1 py-3.5 rounded-xl font-semibold text-sm bg-white/4 hover:bg-white/8 transition-colors"
                  >
                    Create Another
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-3.5 rounded-xl font-semibold text-sm
                      bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                      active:scale-[.98] shadow-lg shadow-indigo-500/25 transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════ Loading state ═══════════════ */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 sm:py-24 gap-6 orch-fade-in">
                <PulseRing size={64} />
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm text-gray-400 animate-pulse max-w-xs text-center leading-relaxed">
                    {statusMsg || "Working on it…"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
