import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Pause, Play, CheckCircle2, Plus, Calendar, ListTodo, Circle, Timer as TimerIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { TrackingModeModal } from "@/components/TrackingModeModal";
import { useTracking } from "@/contexts/TrackingContext";

type Client = { id: string; name: string; company: string | null; hourly_rate?: number | null };
type Request = { id: string; title: string; status: string; client_id: string | null; priority: string };
type Log = { id: string; description: string; duration_seconds: number; started_at: string; client_id: string | null; request_id: string | null; clients?: { name: string } | null; requests?: { title: string } | null };

const TIMER_KEY = "logitrack:timer-state-v1";

const fmt = (s: number) => {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
};

const logSchema = z.object({
  description: z.string().trim().min(1, "Description required").max(200),
  clientId: z.string().uuid().nullable(),
});

const TimeTracker = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [requestId, setRequestId] = useState<string>("");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientCompany, setNewClientCompany] = useState("");
  const [showModeModal, setShowModeModal] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const { activeMode, stopTracking } = useTracking();

  const loadData = async () => {
    const [{ data: c }, { data: r }, { data: l }] = await Promise.all([
      supabase.from("clients").select("id, name, company, hourly_rate").order("created_at", { ascending: false }),
      supabase.from("requests").select("id, title, status, client_id, priority").neq("status", "done").order("created_at", { ascending: false }),
      supabase.from("time_logs").select("id, description, duration_seconds, started_at, client_id, request_id, clients(name), requests(title)").order("started_at", { ascending: false }).limit(20),
    ]);
    setClients((c ?? []) as Client[]);
    setRequests((r ?? []) as Request[]);
    setLogs((l ?? []) as any);
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  // Rehydrate timer from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { running: boolean; startedAt: string | null; elapsed: number; description: string; clientId: string; requestId?: string };
      setDescription(s.description ?? "");
      setClientId(s.clientId ?? "");
      setRequestId(s.requestId ?? "");
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
  }, []);

  // Preselect request via ?requestId= deep link (only if no active timer)
  useEffect(() => {
    const rid = searchParams.get("requestId");
    if (!rid || requests.length === 0 || running || elapsed > 0) return;
    const req = requests.find((r) => r.id === rid);
    if (req) {
      setRequestId(req.id);
      if (req.client_id) setClientId(req.client_id);
      setDescription(req.title);
      // clean URL
      searchParams.delete("requestId");
      setSearchParams(searchParams, { replace: true });
    }
  }, [requests, searchParams, running, elapsed, setSearchParams]);

  // Persist timer state
  useEffect(() => {
    const payload = { running, startedAt: startedAt?.toISOString() ?? null, elapsed, description, clientId, requestId };
    if (!running && elapsed === 0 && !description && !clientId && !requestId) {
      localStorage.removeItem(TIMER_KEY);
    } else {
      localStorage.setItem(TIMER_KEY, JSON.stringify(payload));
    }
  }, [running, startedAt, elapsed, description, clientId, requestId]);

  useEffect(() => {
    if (running) {
      intervalRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  // Filtered request list — strict match to selected client (plus unassigned tasks if no client picked)
  const requestOptions = useMemo(() => {
    if (!clientId) return requests;
    return requests.filter((r) => r.client_id === clientId);
  }, [requests, clientId]);

  // If client changes and the picked request no longer belongs to them, clear it
  useEffect(() => {
    if (!requestId) return;
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;
    if (clientId && req.client_id && req.client_id !== clientId) {
      setRequestId("");
      toast.info("Cleared task — it belongs to a different client.");
    }
  }, [clientId, requestId, requests]);

  const handleClientChange = (cid: string) => {
    setClientId(cid);
    // If currently selected request doesn't belong to this client, clear it
    if (requestId) {
      const req = requests.find((r) => r.id === requestId);
      if (req && req.client_id && cid && req.client_id !== cid) {
        setRequestId("");
      }
    }
  };

  const handleRequestChange = (rid: string) => {
    if (!rid) { setRequestId(""); return; }
    const req = requests.find((r) => r.id === rid);
    if (!req) return;
    // Mismatch guard: prevent selecting a task that belongs to a different client
    if (clientId && req.client_id && req.client_id !== clientId) {
      toast.error("That task belongs to a different client. Change client first.");
      return;
    }
    setRequestId(rid);
    if (req.client_id && !clientId) setClientId(req.client_id);
    if (!description.trim()) setDescription(req.title);
  };

  const handlePause = () => {
    setRunning(false);
    stopTracking();
  };

  const handleStart = () => {
    const parsed = logSchema.safeParse({ description, clientId: clientId || null });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    // Final mismatch check before starting
    if (requestId && clientId) {
      const req = requests.find((r) => r.id === requestId);
      if (req?.client_id && req.client_id !== clientId) {
        toast.error("Selected task doesn't match the selected client.");
        return;
      }
    }
    
    // Force mode selection for new session or resumption
    setShowModeModal(true);
  };

  const startWithMode = (mode: string) => {
    if (startedAt) {
      setStartedAt(new Date(Date.now() - elapsed * 1000));
    } else {
      setStartedAt(new Date());
    }
    setRunning(true);
  };

  const handleFinish = async () => {
    if (!user || !startedAt) return;
    setRunning(false);
    const selectedClient = clients.find((c) => c.id === clientId);
    const rate = Number(selectedClient?.hourly_rate ?? 0);
    const { error } = await supabase.from("time_logs").insert({
      user_id: user.id,
      client_id: clientId || null,
      request_id: requestId || null,
      description,
      duration_seconds: elapsed,
      started_at: startedAt.toISOString(),
      hourly_rate: rate,
      billable: rate > 0,
    });
    if (error) { toast.error(error.message); return; }

    // Auto-mark request in_progress on first log
    if (requestId) {
      const req = requests.find((r) => r.id === requestId);
      if (req && req.status === "open") {
        await supabase.from("requests").update({ status: "in_progress" }).eq("id", requestId);
      }
    }

    toast.success(`Logged ${fmt(elapsed)} for "${description}"`);
    stopTracking(); // Stop any active recording/auto-capture
    setElapsed(0); setDescription(""); setStartedAt(null); setClientId(""); setRequestId("");
    localStorage.removeItem(TIMER_KEY);
    loadData();
  };

  const addClient = async () => {
    if (!user || !newClientName.trim()) { toast.error("Client name required"); return; }
    const { error } = await supabase.from("clients").insert({ user_id: user.id, name: newClientName.trim(), company: newClientCompany.trim() || null });
    if (error) { toast.error(error.message); return; }
    toast.success("Client added");
    setNewClientName(""); setNewClientCompany(""); setShowClientForm(false);
    loadData();
  };

  return (
    <AppLayout searchPlaceholder="Search tasks or shipments...">
      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Timer card */}
        <div className="xl:col-span-2 bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft text-brand-soft-foreground text-xs font-semibold">
                <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-brand animate-pulse" : elapsed > 0 ? "bg-amber-500" : "bg-muted-foreground"}`} />
                {running ? "Currently Tracking" : elapsed > 0 ? "Paused — Resume to continue" : "Ready to Track"}
              </div>
              <input
                type="text"
                placeholder="What are you working on?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={running}
                className="mt-3 w-full text-2xl md:text-3xl font-bold tracking-tight bg-transparent border-0 focus:outline-none disabled:opacity-80 placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              {running ? (
                <>
                  <button onClick={handlePause} className="inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold">
                    <Pause className="h-4 w-4" /> Pause
                  </button>
                  <button onClick={handleFinish} className="inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> Finish Task
                  </button>
                </>
              ) : elapsed > 0 ? (
                <>
                  <button
                    onClick={() => { setElapsed(0); setStartedAt(null); setDescription(""); setClientId(""); setRequestId(""); localStorage.removeItem(TIMER_KEY); }}
                    className="inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold"
                  >
                    Discard
                  </button>
                  <button onClick={handleFinish} className="inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> Finish
                  </button>
                  <button
                    onClick={() => setShowModeModal(true)}
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold ring-2 ring-brand/30"
                  >
                    <Play className="h-4 w-4 fill-current" /> Resume
                  </button>
                </>
              ) : (
                <button onClick={handleStart} className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold">
                  <Play className="h-4 w-4 fill-current" /> Start
                </button>
              )}
            </div>
          </div>

          <div className="mt-10 text-center">
            <div className="font-mono text-7xl md:text-8xl font-bold tracking-tight tabular-nums text-foreground">
              {fmt(elapsed)}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Started At</div>
              <div className="text-lg font-bold mt-1">{startedAt ? startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</div>
              <select
                value={clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                disabled={running}
                className="mt-1 w-full bg-transparent text-lg font-bold focus:outline-none disabled:opacity-80"
              >
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <ListTodo className="h-3 w-3" /> Request / Task
              </div>
              <select
                value={requestId}
                onChange={(e) => handleRequestChange(e.target.value)}
                disabled={running}
                className="mt-1 w-full bg-transparent text-sm font-semibold focus:outline-none disabled:opacity-80"
              >
                <option value="">— No task —</option>
                {requestOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.priority}] {r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Sidebar — clients & recent logs */}
        <div className="space-y-6">
          <div className="bg-primary text-primary-foreground rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Clients</h3>
              <button onClick={() => setShowClientForm((s) => !s)} className="h-8 w-8 grid place-items-center rounded-lg bg-white/10 hover:bg-white/20">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {showClientForm && (
              <div className="mt-4 space-y-2">
                <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Name" className="w-full h-9 px-3 rounded-lg bg-white/10 placeholder:text-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <input value={newClientCompany} onChange={(e) => setNewClientCompany(e.target.value)} placeholder="Company (optional)" className="w-full h-9 px-3 rounded-lg bg-white/10 placeholder:text-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <button onClick={addClient} className="w-full h-9 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold">Add Client</button>
              </div>
            )}
            <div className="mt-4 space-y-2">
              {clients.length === 0 ? (
                <p className="text-sm text-white/60">No clients yet — add one to start billing.</p>
              ) : clients.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                  <div className="h-8 w-8 rounded-full bg-brand grid place-items-center text-xs font-bold">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    {c.company && <div className="text-xs text-white/60 truncate">{c.company}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] p-6">
            <h3 className="font-bold text-lg flex items-center gap-2"><Calendar className="h-4 w-4" /> Recent Logs</h3>
            <div className="mt-4 space-y-3">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No logs yet.</p>
              ) : logs.slice(0, 6).map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{l.description}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {l.clients?.name ?? "No client"}
                      {l.requests?.title ? ` • ${l.requests.title}` : ""}
                      {" • "}{new Date(l.started_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold tabular-nums shrink-0">{fmt(l.duration_seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <TrackingModeModal
        open={showModeModal}
        onOpenChange={setShowModeModal}
        onSelect={startWithMode}
      />
    </AppLayout>
  );
};

export default TimeTracker;
