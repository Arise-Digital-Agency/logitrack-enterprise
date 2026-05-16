import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Clipboard, Truck, CheckCircle2, Play, Filter, Download, TrendingUp } from "lucide-react";

type Stats = { pending: number; active: number; completed: number; trackedSeconds: number };
type LogRow = { id: string; description: string; duration_seconds: number; started_at: string; client?: { name: string; company: string | null } | null };

const fmt = (s: number) => {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
};

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ pending: 0, active: 0, completed: 0, trackedSeconds: 0 });
  const [recent, setRecent] = useState<LogRow[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data: logs } = await supabase
        .from("time_logs")
        .select("id, description, duration_seconds, started_at, clients(name, company)")
        .order("started_at", { ascending: false })
        .limit(5);

      const { data: todayLogs } = await supabase
        .from("time_logs")
        .select("duration_seconds")
        .gte("started_at", today.toISOString());
      const tracked = (todayLogs ?? []).reduce((a, l) => a + (l.duration_seconds || 0), 0);

      const { count: pending } = await supabase.from("invoices").select("*", { count: "exact", head: true }).eq("status", "pending");
      const { count: completed } = await supabase.from("invoices").select("*", { count: "exact", head: true }).eq("status", "paid");
      const { count: active } = await supabase.from("clients").select("*", { count: "exact", head: true });

      setStats({
        pending: pending ?? 0,
        active: active ?? 0,
        completed: completed ?? 0,
        trackedSeconds: tracked,
      });
      setRecent(((logs ?? []) as any).map((l: any) => ({ ...l, client: l.clients })));
    };
    load();
    const i = window.setInterval(load, 30000);
    return () => window.clearInterval(i);
  }, [user]);

  const efficiency = Math.min(100, Math.round((stats.trackedSeconds / (8 * 3600)) * 100));

  const kpis = [
    { label: "Pending Invoices", value: stats.pending, icon: Clipboard, badge: "Live", tone: "warning" as const },
    { label: "Total Clients", value: stats.active, icon: Truck, badge: "Roster", tone: "brand" as const },
    { label: "Completed (Paid)", value: stats.completed, icon: CheckCircle2, badge: "Paid", tone: "success" as const },
  ];

  return (
    <AppLayout searchPlaceholder="Search shipments, manifests, or drivers...">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Operations Overview</h1>
          <p className="text-muted-foreground mt-1">Manage your fleet and track mission-critical logistics in real-time.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Time tracker hero */}
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft text-brand-soft-foreground text-xs font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" /> LIVE MONITORING
                </div>
                <h2 className="mt-3 text-xl font-bold">Time tracked today</h2>
                <p className="text-sm text-muted-foreground">Session started at {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <Link to="/time-tracker" className="inline-flex items-center gap-2 px-5 h-11 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold">
                <Play className="h-4 w-4 fill-current" /> Start Timer
              </Link>
            </div>

            <div className="mt-8 flex items-baseline gap-3">
              <div className="font-mono text-5xl md:text-6xl font-bold tracking-tight text-foreground tabular-nums">
                {fmt(stats.trackedSeconds)}
              </div>
              <div className="text-muted-foreground text-lg">/ 08:00:00</div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between text-xs font-semibold mb-2">
                <span className="uppercase tracking-wider text-muted-foreground">Efficiency</span>
                <span className="text-foreground">{efficiency}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${efficiency}%` }} />
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="space-y-4">
            {kpis.map((k) => (
              <div key={k.label} className="bg-card rounded-2xl border border-border p-5 shadow-[var(--shadow-card)] flex items-center gap-4">
                <div className={`h-11 w-11 rounded-lg grid place-items-center ${
                  k.tone === "brand" ? "bg-brand-soft text-brand-soft-foreground" :
                  k.tone === "warning" ? "bg-warning-soft text-warning-foreground" : "bg-brand-soft text-brand-soft-foreground"
                }`}>
                  <k.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k.label}</div>
                  <div className="text-2xl font-bold text-foreground">{k.value}</div>
                </div>
                <span className="text-xs font-semibold text-brand inline-flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> {k.badge}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent time logs */}
        <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="flex items-center justify-between p-6 pb-4">
            <h3 className="text-lg font-bold">Recent Time Logs</h3>
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-secondary">
                <Filter className="h-3.5 w-3.5" /> Filter
              </button>
              <button className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y border-border bg-secondary/40">
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    No time logs yet. Head to <span className="text-brand font-semibold">Time Tracker</span> to start your first session.
                  </td></tr>
                ) : recent.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-6 py-4 font-medium text-foreground">{l.description}</td>
                    <td className="px-6 py-4 text-muted-foreground">{l.client?.name ?? "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(l.started_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right font-mono font-semibold tabular-nums">{fmt(l.duration_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
