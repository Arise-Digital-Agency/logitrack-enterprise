import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, DollarSign, Briefcase, FileDown, CalendarDays, TrendingUp, BarChart3, Download, CreditCard, Calculator } from "lucide-react";

type Log = {
  id: string;
  description: string;
  duration_seconds: number;
  started_at: string;
  hourly_rate: number | null;
  billable: boolean;
  clients: { name: string } | null;
  requests: { title: string } | null;
};

const fmt = (s: number) => {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  return `${h}h ${m}m`;
};

const DailyReport = () => {
  const { user } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [logs, setLogs] = useState<Log[]>([]);
  const [sourceFilter, setSourceFilter] = useState<"all" | "team_portal">("all");

  useEffect(() => {
    if (!user) return;
    let q = supabase
      .from("time_logs")
      .select("id, description, duration_seconds, started_at, hourly_rate, billable, clients(name), requests(title)")
      .gte("started_at", `${date}T00:00:00Z`)
      .lt("started_at", new Date(new Date(date).getTime() + 86400000).toISOString())
      .order("started_at", { ascending: true });
    if (sourceFilter === "team_portal") {
      q = q.not("team_member_id", "is", null);
    }
    q.then(({ data }) => setLogs((data ?? []) as any));
  }, [user, date, sourceFilter]);

  const totalSec = logs.reduce((a, l) => a + (l.duration_seconds || 0), 0);
  const billableSec = logs.filter((l) => l.billable).reduce((a, l) => a + (l.duration_seconds || 0), 0);
  const earnings = logs.reduce((a, l) => a + ((l.duration_seconds / 3600) * (l.hourly_rate ?? 0)), 0);
  const uniqueClients = new Set(logs.map((l) => l.clients?.name).filter(Boolean)).size;

  // Group by client for breakdown
  const byClient: Record<string, { seconds: number; earnings: number }> = {};
  logs.forEach((l) => {
    const name = l.clients?.name ?? "Unassigned";
    if (!byClient[name]) byClient[name] = { seconds: 0, earnings: 0 };
    byClient[name].seconds += l.duration_seconds || 0;
    byClient[name].earnings += (l.duration_seconds / 3600) * (l.hourly_rate ?? 0);
  });
  const clientBreakdown = Object.entries(byClient).sort((a, b) => b[1].seconds - a[1].seconds);
  const maxClientSec = Math.max(...clientBreakdown.map(([, v]) => v.seconds), 1);

  const exportPdf = async () => {
    // Dynamic import to keep bundle lean
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const dateLabel = new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pw, 36, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Daily Report", 16, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(dateLabel, 16, 28);

    // Summary row
    let y = 46;
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFontSize(8);
    doc.text("TOTAL TRACKED", 16, y);
    doc.text("BILLABLE", 70, y);
    doc.text("EARNINGS", 124, y);
    doc.text("CLIENTS", 170, y);
    y += 6;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(fmt(totalSec), 16, y);
    doc.text(fmt(billableSec), 70, y);
    doc.text(`$${earnings.toFixed(2)}`, 124, y);
    doc.text(String(uniqueClients), 170, y);

    // Divider
    y += 8;
    doc.setDrawColor(226, 232, 240);
    doc.line(16, y, pw - 16, y);
    y += 8;

    // Table header
    doc.setFillColor(248, 250, 252);
    doc.rect(16, y - 4, pw - 32, 8, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text("TIME", 18, y);
    doc.text("DESCRIPTION", 40, y);
    doc.text("CLIENT", 110, y);
    doc.text("REQUEST", 140, y);
    doc.text("DURATION", pw - 36, y, { align: "right" });
    doc.text("EARNINGS", pw - 18, y, { align: "right" });
    y += 6;

    // Table rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    logs.forEach((l, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(16, y - 4, pw - 32, 7, "F");
      }
      doc.setTextColor(100, 116, 139);
      doc.text(new Date(l.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), 18, y);
      doc.setTextColor(15, 23, 42);
      const desc = l.description.length > 35 ? l.description.slice(0, 35) + "…" : l.description;
      doc.text(desc, 40, y);
      doc.setTextColor(100, 116, 139);
      doc.text((l.clients?.name ?? "—").slice(0, 15), 110, y);
      doc.text((l.requests?.title ?? "—").slice(0, 15), 140, y);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(fmt(l.duration_seconds), pw - 36, y, { align: "right" });
      doc.text(`$${((l.duration_seconds / 3600) * (l.hourly_rate ?? 0)).toFixed(2)}`, pw - 18, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 7;
    });

    if (logs.length === 0) {
      doc.setTextColor(148, 163, 184);
      doc.text("No entries for this day.", pw / 2, y + 10, { align: "center" });
    }

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${p} of ${pageCount}`, pw / 2, 290, { align: "center" });
      doc.text("Generated by LogiTrack", 16, 290);
    }

    doc.save(`report-${date}.pdf`);
  };

  const exportCSV = () => {
    if (logs.length === 0) return;
    const headers = ["Time", "Description", "Client", "Request", "Duration (sec)", "Duration (fmt)", "Earnings"];
    const rows = logs.map(l => [
      new Date(l.started_at).toLocaleTimeString(),
      `"${l.description.replace(/"/g, '""')}"`,
      `"${(l.clients?.name ?? "Unassigned").replace(/"/g, '""')}"`,
      `"${(l.requests?.title ?? "N/A").replace(/"/g, '""')}"`,
      l.duration_seconds,
      fmt(l.duration_seconds),
      ((l.duration_seconds / 3600) * (l.hourly_rate ?? 0)).toFixed(2)
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `LogiTrack_Report_${date}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = [
    { label: "Total tracked", value: fmt(totalSec), icon: Clock, sub: `${logs.length} entries` },
    { label: "Billable hours", value: fmt(billableSec), icon: Briefcase, sub: `${totalSec > 0 ? Math.round((billableSec / totalSec) * 100) : 0}% of total` },
    { label: "Estimated earnings", value: `$${earnings.toFixed(2)}`, icon: DollarSign, sub: `${uniqueClients} client${uniqueClients !== 1 ? "s" : ""}` },
    { label: "Avg per entry", value: logs.length > 0 ? fmt(Math.round(totalSec / logs.length)) : "—", icon: TrendingUp, sub: "Per time log" },
  ];

  return (
    <AppLayout searchPlaceholder="Search reports...">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">LogiTrack · Daily Report</p>
            <h1 className="text-3xl font-bold text-foreground mt-1">
              {new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </h1>
            <p className="text-muted-foreground mt-1">Time, revenue, and productivity summary.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as "all" | "team_portal")}
              className="h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All time</option>
              <option value="team_portal">Team portal only</option>
            </select>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 pl-10 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              onClick={exportPdf}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold"
            >
              <FileDown className="h-4 w-4" /> Export PDF
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-card rounded-2xl border border-border p-5 shadow-[var(--shadow-card)] flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-brand-soft text-brand-soft-foreground grid place-items-center shrink-0">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</div>
                <div className="text-2xl font-bold tabular-nums mt-0.5">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Client breakdown */}
          <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] p-6">
            <h3 className="font-bold text-lg flex items-center gap-2"><BarChart3 className="h-4 w-4 text-muted-foreground" /> By Client</h3>
            <div className="mt-5 space-y-3">
              {clientBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data for this day.</p>
              ) : clientBreakdown.map(([name, v]) => (
                <div key={name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{fmt(v.seconds)} · ${v.earnings.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: `${(v.seconds / maxClientSec) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Time log table */}
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-bold text-lg">Time Entries</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border bg-secondary/40">
                    <th className="px-6 py-3">Time</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Client</th>
                    <th className="px-6 py-3">Request</th>
                    <th className="px-6 py-3 text-right">Duration</th>
                    <th className="px-6 py-3 text-right">Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="font-medium">No entries for this day</p>
                        <p className="text-xs mt-1">Select a different date or start tracking time.</p>
                      </td>
                    </tr>
                  ) : logs.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                      <td className="px-6 py-4 font-mono tabular-nums text-muted-foreground">
                        {new Date(l.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-6 py-4 font-medium max-w-[200px] truncate">{l.description}</td>
                      <td className="px-6 py-4 text-muted-foreground">{l.clients?.name ?? "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">{l.requests?.title ?? "—"}</td>
                      <td className="px-6 py-4 text-right font-mono tabular-nums font-semibold">{fmt(l.duration_seconds)}</td>
                      <td className="px-6 py-4 text-right font-mono tabular-nums">
                        ${((l.duration_seconds / 3600) * (l.hourly_rate ?? 0)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {logs.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/20">
                      <td colSpan={4} className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Totals</td>
                      <td className="px-6 py-3 text-right font-mono tabular-nums font-bold">{fmt(totalSec)}</td>
                      <td className="px-6 py-3 text-right font-mono tabular-nums font-bold">${earnings.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default DailyReport;
