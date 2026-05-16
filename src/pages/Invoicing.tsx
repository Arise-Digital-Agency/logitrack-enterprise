import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, CreditCard, DollarSign, Clock, ClipboardCheck, TrendingUp, X, ChevronDown, ChevronUp, Download } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";

type Client = { id: string; name: string; hourly_rate: number };
type TimeLog = {
  id: string;
  client_id: string | null;
  description: string;
  duration_seconds: number;
  hourly_rate: number | null;
  started_at: string;
  billable: boolean;
  request_id: string | null;
  requests?: { title: string } | null;
};
type Invoice = {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  issued_at: string;
  due_at: string | null;
  client_id: string | null;
  clients?: { name: string } | null;
};

const invoiceSchema = z.object({
  client_id: z.string().uuid("Pick a client"),
  invoice_number: z.string().trim().min(1).max(40),
  amount: z.coerce.number().min(0).max(10_000_000),
  status: z.enum(["paid", "pending", "overdue"]),
});

const statusStyles: Record<string, string> = {
  paid: "bg-brand-soft text-brand-soft-foreground",
  pending: "bg-warning-soft text-warning-foreground",
  overdue: "bg-destructive/10 text-destructive",
};

const fmtHours = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const Invoicing = () => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allLogs, setAllLogs] = useState<TimeLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "paid" | "pending" | "overdue">("all");
  const [form, setForm] = useState({
    client_id: "",
    invoice_number: `INV-${Math.floor(Math.random() * 90000) + 10000}`,
    amount: "",
    status: "pending" as "paid" | "pending" | "overdue",
  });

  const exportCSV = () => {
    if (allLogs.length === 0) return;
    const headers = ["Date", "Description", "Client", "Duration (sec)", "Duration (fmt)", "Billable", "Rate", "Amount"];
    const rows = allLogs.map(l => {
      const client = clients.find(c => c.id === l.client_id);
      const rate = l.hourly_rate ?? client?.hourly_rate ?? 0;
      return [
        new Date(l.started_at).toLocaleDateString(),
        `"${l.description.replace(/"/g, '""')}"`,
        `"${(client?.name ?? "Unassigned").replace(/"/g, '""')}"`,
        l.duration_seconds,
        fmtHours(l.duration_seconds),
        l.billable ? "Yes" : "No",
        rate,
        ((l.duration_seconds / 3600) * rate).toFixed(2)
      ];
    });
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "LogiTrack_All_Time_Logs.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const load = async () => {
    const [{ data: inv }, { data: c }, { data: tl }] = await Promise.all([
      supabase.from("invoices").select("*, clients(name)").order("issued_at", { ascending: false }),
      supabase.from("clients").select("id, name, hourly_rate").order("name"),
      supabase.from("time_logs").select("id, client_id, description, duration_seconds, hourly_rate, started_at, billable, request_id, requests(title)").order("started_at", { ascending: false }),
    ]);
    setInvoices((inv ?? []) as any);
    setClients((c ?? []) as any);
    setAllLogs((tl ?? []) as any);
  };
  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("time_logs_invoicing")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_logs" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Logs for the selected client in the form
  const clientLogs = useMemo(() => allLogs.filter((l) => l.client_id === form.client_id), [allLogs, form.client_id]);

  // When client changes, auto-select all logs
  useEffect(() => {
    setSelectedLogIds(new Set(clientLogs.map((l) => l.id)));
  }, [form.client_id, clientLogs.length]);

  // Compute selected totals
  const selectedTotal = useMemo(() => {
    let seconds = 0;
    let amount = 0;
    clientLogs.forEach((l) => {
      if (!selectedLogIds.has(l.id)) return;
      seconds += l.duration_seconds;
      const rate = l.hourly_rate ?? clients.find((c) => c.id === form.client_id)?.hourly_rate ?? 0;
      amount += (l.duration_seconds / 3600) * rate;
    });
    return { seconds, amount };
  }, [selectedLogIds, clientLogs, clients, form.client_id]);

  const toggleLog = (id: string) => {
    setSelectedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedLogIds.size === clientLogs.length) setSelectedLogIds(new Set());
    else setSelectedLogIds(new Set(clientLogs.map((l) => l.id)));
  };

  // Grouped logs by client for breakdown section
  const logsByClient = useMemo(() => {
    const map: Record<string, { client: Client; logs: TimeLog[]; totalSeconds: number; totalAmount: number }> = {};
    allLogs.forEach((l) => {
      const cid = l.client_id || "unassigned";
      if (!map[cid]) {
        const c = clients.find((cl) => cl.id === l.client_id) || { id: "unassigned", name: "Unassigned / General", company: "Internal or unknown", hourly_rate: 0 } as Client;
        map[cid] = { client: c, logs: [], totalSeconds: 0, totalAmount: 0 };
      }
      map[cid].logs.push(l);
      map[cid].totalSeconds += l.duration_seconds;
      const rate = l.hourly_rate ?? map[cid].client.hourly_rate ?? 0;
      map[cid].totalAmount += (l.duration_seconds / 3600) * rate;
    });
    return Object.values(map).sort((a, b) => {
      if (a.client.id === "unassigned") return 1;
      if (b.client.id === "unassigned") return -1;
      return b.totalSeconds - a.totalSeconds;
    });
  }, [allLogs, clients]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const decorated = invoices.map((i) => {
    const due = i.due_at ? new Date(i.due_at) : null;
    const effective = i.status === "pending" && due && due < today ? "overdue" : i.status;
    return { ...i, effective_status: effective };
  });
  const filtered = decorated.filter((i) => filter === "all" || i.effective_status === filter);

  const totals = decorated.reduce(
    (acc, i) => {
      const a = Number(i.amount);
      if (i.effective_status === "paid") acc.revenue += a;
      else if (i.effective_status === "pending") acc.outstanding += a;
      else if (i.effective_status === "overdue") { acc.outstanding += a; acc.overdue += 1; }
      return acc;
    },
    { revenue: 0, outstanding: 0, overdue: 0 }
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = invoiceSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    const { error } = await supabase.from("invoices").insert({
      user_id: user.id,
      client_id: parsed.data.client_id,
      invoice_number: parsed.data.invoice_number,
      amount: parsed.data.amount,
      status: parsed.data.status,
      due_at: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Invoice generated");
    setShowForm(false);
    setForm({ client_id: "", invoice_number: `INV-${Math.floor(Math.random() * 90000) + 10000}`, amount: "", status: "pending" });
    setSelectedLogIds(new Set());
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${status}`);
    load();
  };

  const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const revenueByClient = clients.map((c) => ({
    name: c.name,
    value: invoices.filter((i) => i.client_id === c.id && i.status === "paid").reduce((s, i) => s + Number(i.amount), 0),
  })).sort((a, b) => b.value - a.value).slice(0, 6);
  const maxRev = Math.max(...revenueByClient.map((r) => r.value), 1);

  return (
    <AppLayout searchPlaceholder="Search invoices...">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">LogiTrack Enterprise · Invoicing & Billing</p>
            <h1 className="text-3xl font-bold mt-1">Financial Overview</h1>
            <p className="text-muted-foreground">Manage enterprise billing, billable logs, and client revenue.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold">
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold">
              <Plus className="h-4 w-4" /> Generate Invoice
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: "Outstanding Amount", value: fmtMoney(totals.outstanding), icon: CreditCard, hint: `${invoices.filter(i => i.status !== "paid").length} unpaid invoices` },
            { label: "Total Revenue", value: fmtMoney(totals.revenue), icon: DollarSign, hint: <span className="text-brand inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" /> from paid invoices</span> },
            { label: "Active Clients", value: clients.length, icon: Clock, hint: "Across portfolio" },
            { label: "Overdue", value: totals.overdue, icon: ClipboardCheck, hint: "Awaiting payment" },
          ].map((k) => (
            <div key={k.label} className="bg-card rounded-2xl border border-border p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k.label}</p>
                <k.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl md:text-3xl font-bold mt-2 tabular-nums">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.hint}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue chart */}
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] p-6">
            <h3 className="text-lg font-bold">Revenue by Client</h3>
            <div className="mt-6 grid grid-cols-6 gap-3 h-56 items-end">
              {revenueByClient.length === 0 ? (
                <div className="col-span-6 grid place-items-center text-sm text-muted-foreground">No paid invoices yet</div>
              ) : revenueByClient.map((r, idx) => (
                <div key={r.name} className="flex flex-col items-center gap-2 h-full justify-end">
                  <div
                    className={`w-full rounded-t-lg transition-all ${idx % 2 === 0 ? "bg-brand" : "bg-brand/40"}`}
                    style={{ height: `${Math.max(8, (r.value / maxRev) * 100)}%` }}
                    title={fmtMoney(r.value)}
                  />
                  <div className="text-[10px] font-medium text-center text-muted-foreground line-clamp-2 leading-tight">{r.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Billable summary */}
          <div className="bg-primary text-primary-foreground rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
            <h3 className="font-bold text-lg">Billable Summary</h3>
            <div className="mt-5 rounded-xl bg-white/5 p-4 border border-white/10">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/70">
                <span>Paid This Period</span>
                <span>Est. Outstanding</span>
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-bold">{fmtMoney(totals.revenue)}</span>
                <span className="text-2xl font-bold text-brand">{fmtMoney(totals.outstanding)}</span>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {revenueByClient.slice(0, 3).map((r, idx) => (
                <div key={r.name}>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="truncate">{r.name}</span>
                    <span className="tabular-nums">{fmtMoney(r.value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={idx === 0 ? "h-full bg-brand" : "h-full bg-warning"} style={{ width: `${(r.value / maxRev) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Client Time Logs Breakdown */}
        <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="p-6 pb-4">
            <h3 className="text-lg font-bold">Time Logs by Client</h3>
            <p className="text-xs text-muted-foreground mt-1">All tracked time entries grouped per client for accountability</p>
          </div>
          <div className="divide-y divide-border">
            {logsByClient.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted-foreground text-sm">No time logs tracked yet.</div>
            ) : logsByClient.map(({ client, logs, totalSeconds, totalAmount }) => (
              <div key={client.id}>
                <button
                  onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-secondary grid place-items-center text-[10px] font-bold">
                      {client.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm">{client.name}</div>
                      <div className="text-xs text-muted-foreground">{logs.length} entries · {fmtHours(totalSeconds)} · {fmtMoney(totalAmount)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold tabular-nums">{fmtMoney(totalAmount)}</span>
                    {expandedClient === client.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {expandedClient === client.id && (
                  <div className="bg-secondary/20 border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="px-6 py-2">Description</th>
                          <th className="px-6 py-2">Request</th>
                          <th className="px-6 py-2">Date</th>
                          <th className="px-6 py-2">Duration</th>
                          <th className="px-6 py-2">Rate</th>
                          <th className="px-6 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((l) => {
                          const rate = l.hourly_rate ?? client.hourly_rate ?? 0;
                          const amt = (l.duration_seconds / 3600) * rate;
                          return (
                            <tr key={l.id} className="border-t border-border/50 hover:bg-secondary/30">
                              <td className="px-6 py-2.5 font-medium">{l.description}</td>
                              <td className="px-6 py-2.5 text-muted-foreground">{l.requests?.title ?? "—"}</td>
                              <td className="px-6 py-2.5 text-muted-foreground">{new Date(l.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                              <td className="px-6 py-2.5 tabular-nums">{fmtHours(l.duration_seconds)}</td>
                              <td className="px-6 py-2.5 tabular-nums">${rate}/hr</td>
                              <td className="px-6 py-2.5 text-right font-semibold tabular-nums">{fmtMoney(amt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Invoices table */}
        <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="flex items-center justify-between p-6 pb-4 gap-4">
            <h3 className="text-lg font-bold">Recent Invoices</h3>
            <div className="flex items-center gap-2">
              {(["all", "paid", "pending", "overdue"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    filter === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"
                  }`}
                >
                  {s === "all" ? "All Statuses" : s}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y border-border bg-secondary/40">
                  <th className="px-6 py-3">Invoice ID</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No invoices match this filter.</td></tr>
                ) : filtered.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-6 py-4 font-mono text-xs font-semibold">#{inv.invoice_number}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded bg-secondary grid place-items-center text-[10px] font-bold">
                          {(inv.clients?.name ?? "—").slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium">{inv.clients?.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(inv.issued_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="px-6 py-4 font-semibold tabular-nums">{fmtMoney(Number(inv.amount))}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${statusStyles[(inv as any).effective_status ?? inv.status] ?? ""}`}>{(inv as any).effective_status ?? inv.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <select
                        value={inv.status}
                        onChange={(e) => updateStatus(inv.id, e.target.value)}
                        className="text-xs bg-transparent border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Generate invoice modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-lg bg-card rounded-2xl shadow-[var(--shadow-elevated)] border border-border p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">New Invoice</h3>
              <button type="button" onClick={() => setShowForm(false)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</label>
              <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Time logs picker */}
            {form.client_id && clientLogs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Time Logs</label>
                  <button type="button" onClick={toggleAll} className="text-[10px] font-semibold text-brand hover:underline">
                    {selectedLogIds.size === clientLogs.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 max-h-48 overflow-y-auto divide-y divide-border/50">
                  {clientLogs.map((l) => {
                    const rate = l.hourly_rate ?? clients.find((c) => c.id === form.client_id)?.hourly_rate ?? 0;
                    const amt = (l.duration_seconds / 3600) * rate;
                    return (
                      <label key={l.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/50 cursor-pointer">
                        <Checkbox
                          checked={selectedLogIds.has(l.id)}
                          onCheckedChange={() => toggleLog(l.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{l.description}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(l.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {fmtHours(l.duration_seconds)}
                            {l.requests?.title && ` · ${l.requests.title}`}
                          </div>
                        </div>
                        <span className="text-xs font-semibold tabular-nums shrink-0">{fmtMoney(amt)}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="rounded-lg border border-border bg-secondary/50 p-3 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{selectedLogIds.size}</span> logs selected · {fmtHours(selectedTotal.seconds)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums">{fmtMoney(selectedTotal.amount)}</span>
                    <button type="button" onClick={() => setForm({ ...form, amount: selectedTotal.amount.toFixed(2) })} className="text-[10px] font-semibold text-brand hover:underline">
                      Use this amount
                    </button>
                  </div>
                </div>
              </div>
            )}
            {form.client_id && clientLogs.length === 0 && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground text-center">
                No time logs found for this client.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice #</label>
                <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount ($)</label>
                <input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            <button type="submit" className="w-full h-11 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground font-semibold text-sm">Create Invoice</button>
          </form>
        </div>
      )}
    </AppLayout>
  );
};

export default Invoicing;
