import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Timer, Play, Pause, CheckCircle2, Clock, ListTodo, Plus, Trash2, Calendar, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { CaptureWidget } from "@/components/CaptureWidget";
import { TrackerAssignedTasks } from "@/components/TrackerAssignedTasks";
import { TrackingModeModal } from "@/components/TrackingModeModal";
import { useTracking } from "@/contexts/TrackingContext";

const FUNC_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tracker-portal`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const TIMER_KEY_PREFIX = "logitrack:portal-timer:";

// assigned_tasks.status: open | accepted | in_progress | done
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  accepted_at?: string | null;
  clients?: { name: string } | null;
  requests?: { title: string } | null;
};
type Log = { id: string; description: string; duration_seconds: number; started_at: string; assigned_task_id: string | null };

const fmt = (s: number) => {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
};

const fmtHours = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const TrackerPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [member, setMember] = useState<{ id: string; name: string; responsibility: string | null } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timer state
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const { stopTracking } = useTracking();

  // Manual entry state
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");

  const TIMER_KEY = useMemo(() => `${TIMER_KEY_PREFIX}${token}`, [token]);

  const api = async (op?: string, body?: any) => {
    const params = new URLSearchParams({ token: token! });
    if (op) params.set("op", op);
    const res = await fetch(`${FUNC_BASE}?${params}`, {
      method: op ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: op ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  const loadData = async () => {
    try {
      const data = await api();
      if (data.error) { setError(data.error); return; }
      setMember(data.member);
      setTasks(data.tasks ?? []);
      setLogs(data.logs ?? []);
    } catch { setError("Failed to load portal"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (token) loadData(); }, [token]);

  // Rehydrate timer
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      setSelectedTaskId(s.selectedTaskId ?? "");
      if (s.running && s.startedAt) {
        const startMs = new Date(s.startedAt).getTime();
        const liveElapsed = Math.floor((Date.now() - startMs) / 1000);
        setStartedAt(new Date(startMs));
        setElapsed(liveElapsed);
        setRunning(true);
      } else {
        setElapsed(s.elapsed ?? 0);
        if (s.startedAt) setStartedAt(new Date(s.startedAt));
      }
    } catch { /* ignore */ }
  }, [TIMER_KEY]);

  // Persist timer
  useEffect(() => {
    const payload = { running, startedAt: startedAt?.toISOString() ?? null, elapsed, selectedTaskId };
    if (!running && elapsed === 0 && !selectedTaskId) {
      localStorage.removeItem(TIMER_KEY);
    } else {
      localStorage.setItem(TIMER_KEY, JSON.stringify(payload));
    }
  }, [running, startedAt, elapsed, selectedTaskId, TIMER_KEY]);

  useEffect(() => {
    if (running) {
      intervalRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const trackableTasks = tasks.filter((t) => t.status === "accepted" || t.status === "in_progress");
  const pendingTasks = tasks.filter((t) => t.status === "open");
  const readyTasks = tasks.filter((t) => t.status === "accepted");
  const activeTasks = tasks.filter((t) => t.status === "in_progress");

  const handleAccept = async (taskId: string, andStart = false) => {
    setAcceptingId(taskId);
    try {
      const result = await api("accept_task", { assigned_task_id: taskId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const t = tasks.find((x) => x.id === taskId);
      setSelectedTaskId(taskId);
      toast.success("Assignment accepted");
      await loadData();
      if (andStart) setShowModeModal(true);
    } catch {
      toast.error("Failed to accept assignment");
    } finally {
      setAcceptingId(null);
    }
  };

  const handleStart = () => {
    if (!selectedTaskId) { toast.error("Select a project/task first"); return; }
    if (selectedTaskId) {
      const t = tasks.find((x) => x.id === selectedTaskId);
      if (t?.status === "open") {
        toast.error("Accept the assignment before starting");
        return;
      }
    }
    if (startedAt) {
      setRunning(true);
      return;
    }
    setShowModeModal(true);
  };

  const startWithMode = async (_mode: string) => {
    if (selectedTaskId) {
      const t = tasks.find((x) => x.id === selectedTaskId);
      if (t?.status === "accepted") {
        await api("start_log", { assigned_task_id: selectedTaskId, description: t.title });
        await loadData();
      }
    }
    setStartedAt(new Date());
    setRunning(true);
  };

  const handleStartReady = (task: Task) => {
    setSelectedTaskId(task.id);
    setShowModeModal(true);
  };

  const handleFinish = async (markDone = false) => {
    if (!startedAt || elapsed < 1) return;
    setRunning(false);
    setSaving(true);
    const t = tasks.find((x) => x.id === selectedTaskId);
    try {
      const result = await api("save_log", {
        assigned_task_id: selectedTaskId || null,
        description: t?.title ?? "Untitled Session",
        duration_seconds: elapsed,
        started_at: startedAt.toISOString(),
        mark_done: markDone,
      });
      if (result.error) { alert(result.error); setSaving(false); return; }
      setElapsed(0);
      setSelectedTaskId("");
      setStartedAt(null);
      stopTracking();
      localStorage.removeItem(TIMER_KEY);
      loadData();
    } catch { alert("Failed to save log"); }
    finally { setSaving(false); }
  };

  const handleDiscard = () => {
    setElapsed(0);
    setSelectedTaskId("");
    setStartedAt(null);
    stopTracking();
    localStorage.removeItem(TIMER_KEY);
    toast.info("Session discarded");
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const secs = (parseInt(manualHours) || 0) * 3600 + (parseInt(manualMinutes) || 0) * 60;
    if (secs < 60) { alert("Duration too short"); return; }
    if (!selectedTaskId) { alert("Project selection required"); return; }
    
    setSaving(true);
    const t = tasks.find((x) => x.id === selectedTaskId);
    try {
      const result = await api("save_log", {
        assigned_task_id: selectedTaskId || null,
        description: t?.title ?? "Manual Entry",
        duration_seconds: secs,
        started_at: new Date(manualDate).toISOString(),
      });
      if (result.error) { alert(result.error); return; }
      setShowManualForm(false);
      setSelectedTaskId("");
      setManualHours("");
      setManualMinutes("");
      loadData();
    } catch { alert("Failed to save log"); }
    finally { setSaving(false); }
  };

  const handleAddTask = async () => {
    const title = prompt("Enter the name of the new project task:");
    if (!title?.trim()) return;
    setSaving(true);
    try {
      // 1. Create task (accepted)
      const res = await api("add_task", { title: title.trim() });
      if (res.error) { toast.error(res.error); return; }
      
      const newTaskId = res.task?.id;
      if (newTaskId) {
        setSelectedTaskId(newTaskId);
        // 2. Start log immediately (sets status to in_progress)
        const startRes = await api("start_log", { assigned_task_id: newTaskId, description: title.trim() });
        if (startRes.error) {
          toast.error(startRes.error);
        } else {
          setStartedAt(new Date());
          setRunning(true);
          toast.success("Project started! Client can now see your active status.");
        }
      }
      await loadData();
    } catch { toast.error("Failed to create and start task"); }
    finally { setSaving(false); }
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm("Delete this log?")) return;
    try {
      const res = await api("delete_log", { id });
      if (res.error) alert(res.error);
      else loadData();
    } catch { alert("Failed to delete"); }
  };

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-center space-y-4">
        <div className="relative h-12 w-12 mx-auto">
          <Timer className="h-12 w-12 text-brand animate-pulse" />
          <div className="absolute inset-0 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Authenticating portal...</p>
      </div>
    </div>
  );

  if (error || !member) return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-4 p-8 bg-card rounded-2xl border border-border shadow-lg">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Portal Unavailable</h2>
        <p className="text-muted-foreground">{error || "This access link is invalid or has expired."}</p>
        <button onClick={() => window.location.reload()} className="h-11 px-6 rounded-lg bg-secondary hover:bg-secondary/80 font-semibold text-sm">Try Again</button>
      </div>
    </div>
  );

  const totalTracked = logs.reduce((s, l) => s + l.duration_seconds, 0);

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#020817]">
      {/* Premium Header */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-brand shadow-lg shadow-brand/20 grid place-items-center">
              <Timer className="h-5 w-5 text-brand-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Tracker Portal</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Logged in as <span className="font-semibold text-foreground">{member.name}</span>
                {member.responsibility && <span className="opacity-60">· {member.responsibility}</span>}
              </div>
            </div>
          </div>
          <div className="hidden sm:flex gap-6 text-right">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today</div>
              <div className="text-xl font-bold tabular-nums text-brand">{fmtHours(logs.filter(l => new Date(l.started_at).toDateString() === new Date().toDateString()).reduce((s, l) => s + l.duration_seconds, 0))}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Lifetime</div>
              <div className="text-xl font-bold tabular-nums text-muted-foreground/60">{fmtHours(totalTracked)}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Timer & Controls */}
          <div className="lg:col-span-2 space-y-6">
            
            <div className="bg-card rounded-3xl border border-border shadow-xl shadow-black/5 overflow-hidden">
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft text-brand-soft-foreground text-[10px] font-bold uppercase tracking-wider">
                    <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-brand animate-pulse" : "bg-muted-foreground"}`} />
                    {running ? "Live Session" : elapsed > 0 ? "Paused" : "Ready to track"}
                  </div>
                  {!running && !elapsed && (
                    <button 
                      onClick={() => setShowManualForm(!showManualForm)}
                      className="text-xs font-semibold text-brand hover:underline flex items-center gap-1.5"
                    >
                      {showManualForm ? "Switch to Timer" : "Log manually instead"}
                    </button>
                  )}
                </div>

                {!showManualForm ? (
                  <div className="text-center py-4">
                    <div className="font-mono text-7xl sm:text-8xl md:text-9xl font-bold tracking-tighter tabular-nums text-foreground drop-shadow-sm">
                      {fmt(elapsed)}
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleManualSubmit} className="space-y-4 py-4 animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full h-11 pl-9 pr-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hours</label>
                        <input type="number" min="0" max="23" placeholder="0" value={manualHours} onChange={(e) => setManualHours(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Minutes</label>
                        <input type="number" min="0" max="59" placeholder="0" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                      </div>
                    </div>
                    <button type="submit" disabled={saving} className="w-full h-12 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold shadow-lg shadow-brand/20 disabled:opacity-50">
                      Save Manual Entry
                    </button>
                  </form>
                )}

                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name of the project</label>
                      <button onClick={handleAddTask} disabled={running || saving} type="button" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand text-brand-foreground hover:bg-brand/90 text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm">
                        <Plus className="h-3 w-3" /> Create & Start Tracking
                      </button>
                    </div>
                    <div className="relative group">
                      <ListTodo className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-brand transition-colors" />
                      <select
                        value={selectedTaskId}
                        onChange={(e) => setSelectedTaskId(e.target.value)}
                        disabled={running}
                        className="w-full h-14 pl-12 pr-10 rounded-2xl border-2 border-border bg-background text-base font-bold focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:opacity-50 appearance-none cursor-pointer transition-all"
                      >
                        <option value="">Select an active project task...</option>
                        {trackableTasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title} {t.requests?.title ? `— ${t.requests.title}` : ""}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                        <ChevronDown className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                </div>

                {!showManualForm && (
                  <div className="flex items-center justify-center gap-3 pt-4">
                    {running ? (
                      <>
                        <button onClick={() => setRunning(false)} className="inline-flex items-center gap-2 h-14 px-8 rounded-2xl bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold shadow-sm transition-all">
                          <Pause className="h-5 w-5" /> Pause
                        </button>
                        <button onClick={() => handleFinish(true)} disabled={saving} className="inline-flex items-center gap-2 h-14 px-8 rounded-2xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold shadow-xl shadow-brand/20 disabled:opacity-50 transition-all scale-105">
                          <CheckCircle2 className="h-5 w-5" /> Finish & Complete
                        </button>
                      </>
                    ) : elapsed > 0 ? (
                      <>
                        <button onClick={() => { if(confirm("Discard session?")) handleDiscard(); }} className="inline-flex items-center gap-2 h-12 px-6 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/5 font-semibold transition-colors">
                          Discard
                        </button>
                        <button onClick={() => handleFinish(false)} disabled={saving} className="inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold disabled:opacity-50">
                          Save Progress
                        </button>
                        <button onClick={() => { if (!startedAt) setStartedAt(new Date(Date.now() - elapsed * 1000)); setRunning(true); }} className="inline-flex items-center gap-2 h-14 px-10 rounded-2xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold shadow-xl shadow-brand/20 transition-all scale-105">
                          <Play className="h-5 w-5 fill-current" /> Resume
                        </button>
                      </>
                    ) : (
                    <button onClick={handleStart} disabled={!selectedTaskId || saving} className="inline-flex items-center gap-3 h-14 px-12 rounded-2xl bg-brand hover:bg-brand/90 text-brand-foreground text-lg font-bold shadow-xl shadow-brand/20 disabled:opacity-50 transition-all active:scale-95 group">
                        <Play className="h-6 w-6 fill-current group-hover:scale-110 transition-transform" /> 
                        {selectedTaskId ? "Start Project Session" : "Select Project to Start"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {tasks.length > 0 && (
              <TrackerAssignedTasks
                tasks={tasks}
                pendingTasks={pendingTasks}
                readyTasks={readyTasks}
                activeTasks={activeTasks}
                acceptingId={acceptingId}
                running={running}
                selectedTaskId={selectedTaskId}
                onAccept={handleAccept}
                onStartReady={handleStartReady}
              />
            )}
          </div>

          {/* Right Column: History & Stats */}
          <div className="space-y-6">
            
            <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
              <div className="p-6 border-b border-border/50 flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2 text-foreground/80"><Clock className="h-4 w-4" /> Recent Activity</h3>
              </div>
              <div className="p-2">
                {logs.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground font-medium">No sessions logged yet.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {logs.map((l) => {
                      const task = tasks.find((t) => t.id === l.assigned_task_id);
                      return (
                        <div key={l.id} className="group p-4 rounded-2xl hover:bg-secondary/50 transition-all border border-transparent hover:border-border/50">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold text-foreground truncate">{l.description}</div>
                              <div className="text-[10px] text-muted-foreground mt-1 flex flex-col gap-0.5">
                                <span className="font-medium text-muted-foreground/80">{new Date(l.started_at).toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                {task && <span className="truncate flex items-center gap-1"><ListTodo className="h-2.5 w-2.5" /> {task.title}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono text-sm font-bold text-foreground tabular-nums">{fmtHours(l.duration_seconds)}</div>
                              <button 
                                onClick={() => handleDeleteLog(l.id)}
                                className="mt-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-brand rounded-3xl p-6 text-brand-foreground shadow-xl shadow-brand/20">
              <h4 className="text-xs font-bold uppercase tracking-widest opacity-70">Focus Score</h4>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-bold">8.4</span>
                <span className="text-xs opacity-70 font-medium">/ 10.0</span>
              </div>
              <p className="mt-2 text-xs opacity-80 leading-relaxed font-medium">You have been extremely productive this week. Keep it up!</p>
              <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase opacity-60">Avg. Session</div>
                  <div className="text-lg font-bold">52m</div>
                </div>
                <div className="h-10 w-10 rounded-full border-2 border-white/20 border-t-white flex items-center justify-center">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <CaptureWidget />

      <TrackingModeModal
        open={showModeModal}
        onOpenChange={setShowModeModal}
        onSelect={startWithMode}
      />

      <footer className="max-w-5xl mx-auto px-6 py-12 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
        LogiTrack HQ Portal · Secure End-to-End Encryption
      </footer>
    </div>
  );
};

const ChevronDown = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 9 6 6 6-6"/>
  </svg>
);

const TrendingUp = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

export default TrackerPortal;
