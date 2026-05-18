import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Trash2, Link2, Users, ClipboardList, UserPlus, X, Pencil } from "lucide-react";
import { toast } from "sonner";

type TeamMember = { id: string; name: string; email: string | null; responsibility: string | null; share_token: string; created_at: string; client_id: string | null; role: string };
type AssignedTask = { id: string; team_member_id: string; client_id: string | null; title: string; description: string | null; status: string; created_at: string };
type Client = { id: string; name: string };

const TaskAssignment = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberResponsibility, setMemberResponsibility] = useState("");
  const [memberClientId, setMemberClientId] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskMemberId, setTaskMemberId] = useState("");
  const [taskClientId, setTaskClientId] = useState("");
  const [taskRequestId, setTaskRequestId] = useState("");
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const load = async () => {
    const [{ data: m }, { data: t }, { data: c }, { data: r }] = await Promise.all([
      supabase.from("team_members").select("*").order("created_at", { ascending: false }),
      supabase.from("assigned_tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("requests").select("id, title, client_id").order("created_at", { ascending: false }),
    ]);
    setMembers((m ?? []) as any);
    setTasks((t ?? []) as any);
    setClients((c ?? []) as any);
    setRequests((r ?? []) as any);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !memberName.trim() || !memberClientId) {
      toast.error("Name and client are required");
      return;
    }
    const { error } = await supabase.from("team_members").insert({
      user_id: user.id,
      name: memberName.trim(),
      email: memberEmail.trim() || null,
      responsibility: memberResponsibility.trim() || null,
      client_id: memberClientId,
      role: memberRole,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${memberName.trim()} added to team`);
    setMemberName(""); setMemberEmail(""); setMemberResponsibility(""); setMemberClientId(""); setMemberRole("member"); setShowMemberForm(false);
    load();
  };

  const updateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !memberName.trim() || !memberClientId) return;
    const { error } = await supabase.from("team_members").update({
      name: memberName.trim(),
      email: memberEmail.trim() || null,
      responsibility: memberResponsibility.trim() || null,
      client_id: memberClientId,
      role: memberRole,
    }).eq("id", editingMember.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Team member updated");
    setEditingMember(null);
    setMemberName(""); setMemberEmail(""); setMemberResponsibility(""); setMemberClientId(""); setMemberRole("member");
    load();
  };

  const startEditMember = (m: TeamMember) => {
    setEditingMember(m);
    setMemberName(m.name);
    setMemberEmail(m.email ?? "");
    setMemberResponsibility(m.responsibility ?? "");
    setMemberClientId(m.client_id ?? "");
    setMemberRole(m.role || "member");
  };

  const removeMember = async (id: string) => {
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Team member removed");
    load();
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !taskTitle.trim() || !taskMemberId) return;
    const member = members.find((m) => m.id === taskMemberId);
    const resolvedClientId = taskClientId || member?.client_id || null;
    const { error } = await supabase.from("assigned_tasks").insert({
      user_id: user.id,
      team_member_id: taskMemberId,
      client_id: resolvedClientId,
      request_id: taskRequestId || null,
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Task assigned");
    setTaskTitle(""); setTaskDesc(""); setTaskMemberId(""); setTaskClientId(""); setTaskRequestId(""); setShowTaskForm(false);
    load();
  };

  const removeTask = async (id: string) => {
    const { error } = await supabase.from("assigned_tasks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Task removed");
    load();
  };

  const updateTaskStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("assigned_tasks").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const copyPortalLink = (token: string) => {
    const link = `${window.location.origin}/tracker-portal/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Time tracking portal link copied!", { description: link });
  };

  const memberTasks = (memberId: string) => tasks.filter((t) => t.team_member_id === memberId);

  const statusColor: Record<string, string> = {
    open: "bg-warning-soft text-warning-foreground",
    accepted: "bg-secondary text-secondary-foreground",
    in_progress: "bg-brand-soft text-brand-soft-foreground",
    done: "bg-brand/10 text-brand",
  };

  return (
    <AppLayout searchPlaceholder="Search tasks...">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">LogiTrack Enterprise · Team and responsibilities</p>
            <h1 className="text-3xl font-bold mt-1">People & Roles</h1>
            <p className="text-muted-foreground">Manage your team, define their responsibilities, and assign work.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowMemberForm(true)} className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold">
              <UserPlus className="h-4 w-4" /> Add Person
            </button>
            <button onClick={() => setShowTaskForm(true)} className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold">
              <Plus className="h-4 w-4" /> Assign Task
            </button>
          </div>
        </div>

        {/* Team Members */}
        <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="p-6 pb-4">
            <h3 className="text-lg font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Team Members</h3>
            <p className="text-xs text-muted-foreground mt-1">People you can assign work to. Share their time tracking portal link so they can track hours.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y border-border bg-secondary/40">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Responsibility</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Tasks</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No team members yet. Add someone to start assigning work.</td></tr>
                ) : members.map((m) => {
                  const memberClient = clients.find((c) => c.id === m.client_id);
                  return (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-6 py-4 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-brand-soft text-brand-soft-foreground grid place-items-center text-[10px] font-bold">
                          {m.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span>{m.name}</span>
                          {m.role === "manager" && <span className="text-[9px] font-bold uppercase tracking-wider text-brand bg-brand/10 px-1.5 py-0.5 rounded w-max mt-0.5">Manager</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{m.responsibility ?? "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{memberClient?.name ?? "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{m.email ?? "—"}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold">{memberTasks(m.id).length} tasks</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => copyPortalLink(m.share_token)} title="Copy link" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-brand hover:bg-brand-soft">
                          <Link2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => startEditMember(m)} title="Edit member" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-secondary">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => removeMember(m.id)} title="Remove member" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assigned Tasks */}
        <div className="bg-card rounded-2xl border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="p-6 pb-4">
            <h3 className="text-lg font-bold flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Assigned Tasks</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y border-border bg-secondary/40">
                  <th className="px-6 py-3">Task</th>
                  <th className="px-6 py-3">Project / Request</th>
                  <th className="px-6 py-3">Assigned To</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">No tasks assigned yet.</td></tr>
                ) : tasks.map((t) => {
                  const member = members.find((m) => m.id === t.team_member_id);
                  const client = clients.find((c) => c.id === t.client_id);
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                      <td className="px-6 py-4">
                        <div className="font-medium">{t.title}</div>
                        {t.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</div>}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{requests.find(r => r.id === (t as any).request_id)?.title ?? "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{member?.name ?? "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{client?.name ?? "—"}</td>
                      <td className="px-6 py-4">
                        <select
                          value={t.status}
                          onChange={(e) => updateTaskStatus(t.id, e.target.value)}
                          className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border-0 focus:outline-none ${statusColor[t.status] ?? ""}`}
                        >
                          <option value="open">Open</option>
                          <option value="accepted">Accepted</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => removeTask(t.id)} className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-destructive hover:bg-destructive/10 text-xs font-medium">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      {showMemberForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => setShowMemberForm(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={addMember} className="w-full max-w-md bg-card rounded-2xl shadow-[var(--shadow-elevated)] border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Add Team Member</h3>
              <button type="button" onClick={() => setShowMemberForm(false)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name *</label>
              <input required value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="John Doe" className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client *</label>
              <select required value={memberClientId} onChange={(e) => setMemberClientId(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role *</label>
              <select required value={memberRole} onChange={(e) => setMemberRole(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="member">Team Member</option>
                <option value="manager">Manager (Can view team logs)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsibility</label>
              <input value={memberResponsibility} onChange={(e) => setMemberResponsibility(e.target.value)} placeholder="Senior Logistics Coordinator" className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email (optional)</label>
              <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="john@example.com" className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button type="submit" className="w-full h-11 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground font-semibold text-sm">Add Member</button>
          </form>
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => setEditingMember(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={updateMember} className="w-full max-w-md bg-card rounded-2xl shadow-[var(--shadow-elevated)] border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Team Member</h3>
              <button type="button" onClick={() => setEditingMember(null)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name *</label>
              <input required value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="John Doe" className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client *</label>
              <select required value={memberClientId} onChange={(e) => setMemberClientId(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role *</label>
              <select required value={memberRole} onChange={(e) => setMemberRole(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="member">Team Member</option>
                <option value="manager">Manager (Can view team logs)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsibility</label>
              <input value={memberResponsibility} onChange={(e) => setMemberResponsibility(e.target.value)} placeholder="Senior Logistics Coordinator" className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email (optional)</label>
              <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="john@example.com" className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditingMember(null)} className="flex-1 h-11 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold text-sm">Cancel</button>
              <button type="submit" className="flex-2 h-11 px-8 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground font-semibold text-sm">Save Changes</button>
            </div>
          </form>
        </div>
      )}

      {/* Assign Task Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => setShowTaskForm(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={addTask} className="w-full max-w-md bg-card rounded-2xl shadow-[var(--shadow-elevated)] border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Assign Task</h3>
              <button type="button" onClick={() => setShowTaskForm(false)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assign To *</label>
              <select required value={taskMemberId} onChange={(e) => {
                const id = e.target.value;
                setTaskMemberId(id);
                const m = members.find((x) => x.id === id);
                if (m?.client_id) setTaskClientId(m.client_id);
              }} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select person...</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Task Title *</label>
              <input required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Review shipment #1234" className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
              <textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Details..." rows={3} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client (optional)</label>
              <select value={taskClientId} onChange={(e) => {
                setTaskClientId(e.target.value);
                // Clear request if it doesn't match client
                if (e.target.value && taskRequestId) {
                  const req = requests.find(r => r.id === taskRequestId);
                  if (req && req.client_id && req.client_id !== e.target.value) setTaskRequestId("");
                }
              }} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project / Request (optional)</label>
              <select value={taskRequestId} onChange={(e) => {
                setTaskRequestId(e.target.value);
                // Auto-set client if request has one
                if (e.target.value) {
                  const req = requests.find(r => r.id === e.target.value);
                  if (req?.client_id) setTaskClientId(req.client_id);
                  if (req && !taskTitle) setTaskTitle(req.title);
                }
              }} className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">No project</option>
                {requests
                  .filter(r => !taskClientId || r.client_id === taskClientId)
                  .map((r) => <option key={r.id} value={r.id}>{r.title}</option>)
                }
              </select>
            </div>
            <button type="submit" className="w-full h-11 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground font-semibold text-sm">Assign Task</button>
          </form>
        </div>
      )}
    </AppLayout>
  );
};

export default TaskAssignment;
