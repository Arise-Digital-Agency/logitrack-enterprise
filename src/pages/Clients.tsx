import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Trash2, Building2, Pencil, Check, X, Link2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Contact name is required").max(100, "Name too long"),
  company: z.string().trim().max(120, "Company name too long").optional(),
  hourly_rate: z
    .number({ invalid_type_error: "Hourly rate must be a number" })
    .min(0, "Hourly rate cannot be negative")
    .max(10000, "Hourly rate seems too high (max $10,000/hr)")
    .finite("Invalid hourly rate"),
});

type Client = { id: string; name: string; company: string | null; color: string | null; created_at: string; hourly_rate: number | null; share_token: string | null };

const Clients = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [rate, setRate] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [{ data: c }, { data: l }] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("time_logs").select("*, requests(title)").order("started_at", { ascending: false }),
    ]);
    setClients(c ?? []);
    setLogs(l ?? []);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = clientSchema.safeParse({
      name,
      company: company || undefined,
      hourly_rate: rate === "" ? 0 : Number(rate),
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("clients").insert({
      user_id: user.id,
      name: parsed.data.name,
      company: parsed.data.company ?? null,
      hourly_rate: parsed.data.hourly_rate,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`${parsed.data.name} added${parsed.data.hourly_rate > 0 ? ` at $${parsed.data.hourly_rate.toFixed(2)}/hr` : ""}`);
    setName(""); setCompany(""); setRate("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Client removed");
    load();
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState<string>("");

  const saveRate = async (id: string) => {
    const num = Number(editRate);
    const parsed = clientSchema.shape.hourly_rate.safeParse(num);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    const { error } = await supabase.from("clients").update({ hourly_rate: parsed.data }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Hourly rate updated");
    setEditingId(null);
    load();
  };

  return (
    <AppLayout searchPlaceholder="Search clients...">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your client roster.</p>
        </div>

        <form onSubmit={add} className="bg-card rounded-lg border border-border p-5 shadow-[var(--shadow-card)] space-y-3">
          <p className="text-xs text-muted-foreground">Set a default hourly rate for each client — it'll auto-apply to time logs for accurate billing.</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_180px_auto] gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Contact name *</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe" required maxLength={100}
                className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Company</label>
              <input
                value={company} onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Logistics" maxLength={120}
                className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Hourly rate (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number" min="0" max="10000" step="0.01" inputMode="decimal"
                  value={rate} onChange={(e) => setRate(e.target.value)}
                  placeholder="0.00"
                  className="h-11 w-full pl-7 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <button disabled={loading} className="self-end inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add Client
            </button>
          </div>
        </form>

        <div className="bg-card rounded-lg border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border bg-secondary/40">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Company</th>
                  <th className="px-6 py-3 text-right">Rate / hr</th>
                  <th className="px-6 py-3">Added</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">No clients yet.</td></tr>
                ) : clients.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-6 py-4 font-medium text-foreground">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-brand-soft text-brand-soft-foreground grid place-items-center"><Building2 className="h-3.5 w-3.5" /></div>
                        {c.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{c.company ?? "—"}</td>
                    <td className="px-6 py-4 text-right font-mono tabular-nums">
                      {editingId === c.id ? (
                        <div className="inline-flex items-center gap-1 justify-end">
                          <span className="text-muted-foreground">$</span>
                          <input
                            type="number" min="0" max="10000" step="0.01" autoFocus
                            value={editRate} onChange={(e) => setEditRate(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveRate(c.id); if (e.key === "Escape") setEditingId(null); }}
                            className="h-8 w-24 px-2 rounded-md border border-input bg-background text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <button onClick={() => saveRate(c.id)} className="h-8 w-8 grid place-items-center rounded-md text-brand hover:bg-brand-soft"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingId(null)} className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-secondary"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <span>${Number(c.hourly_rate ?? 0).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {c.share_token && (
                          <button
                            onClick={() => {
                              const link = `${window.location.origin}/portal/${c.share_token}`;
                              navigator.clipboard.writeText(link);
                              toast.success("Portal link copied", { description: link });
                            }}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-muted-foreground hover:bg-secondary text-xs font-medium"
                            title="Copy client portal link"
                          >
                            <Link2 className="h-3.5 w-3.5" /> Share
                          </button>
                        )}
                        {editingId !== c.id && (
                          <button
                            onClick={() => { setEditingId(c.id); setEditRate(String(c.hourly_rate ?? 0)); }}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-muted-foreground hover:bg-secondary text-xs font-medium"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Rate
                          </button>
                        )}
                        <button onClick={() => remove(c.id)} className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-destructive hover:bg-destructive/10 text-xs font-medium">
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent logs by client */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map(c => {
            const clientLogs = logs.filter(l => l.client_id === c.id).slice(0, 3);
            const totalSec = logs.filter(l => l.client_id === c.id).reduce((a, b) => a + b.duration_seconds, 0);
            if (clientLogs.length === 0) return null;
            return (
              <div key={c.id} className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-brand/10 text-brand grid place-items-center text-[10px] font-bold">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-bold text-sm">{c.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">{Math.floor(totalSec / 3600)}h {Math.floor((totalSec % 3600) / 60)}m tracked</span>
                </div>
                <div className="space-y-2">
                  {clientLogs.map(l => (
                    <div key={l.id} className="flex items-start justify-between gap-2 text-xs py-1 border-t border-border/50 first:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{l.description}</div>
                        <div className="text-[10px] text-muted-foreground">{new Date(l.started_at).toLocaleDateString()} {l.requests?.title && `· ${l.requests.title}`}</div>
                      </div>
                      <span className="font-mono tabular-nums font-semibold">
                        {Math.floor(l.duration_seconds / 3600).toString().padStart(2, "0")}:{Math.floor((l.duration_seconds % 3600) / 60).toString().padStart(2, "0")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
};

export default Clients;
