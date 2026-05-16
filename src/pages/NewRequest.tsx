import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Send, Trash2, Play, Clock, CheckCircle2, Paperclip, FolderUp, FileIcon, Download, MessageSquare, CheckSquare, Square, Plus } from "lucide-react";

type Client = { id: string; name: string; company: string | null };
type Request = { id: string; title: string; priority: string; status: string; due_at: string | null; created_at: string; client_id: string | null; clients?: { name: string } | null };
type Attachment = { id: string; request_id: string; file_name: string; relative_path: string | null; storage_path: string; size_bytes: number | null; uploaded_by: string; created_at: string };
type Comment = { id: string; request_id: string; author: string; author_name: string | null; body: string; created_at: string };
type Task = { id: string; request_id: string; title: string; is_done: boolean; created_at: string };

const priorities = ["low", "medium", "high"] as const;
const statuses = ["open", "in_progress", "done"] as const;

const fmt = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return "0m";
  return `${h > 0 ? `${h}h ` : ""}${m}m`;
};

const NewRequest = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [trackedByRequest, setTrackedByRequest] = useState<Record<string, number>>({});
  const [attachmentsByRequest, setAttachmentsByRequest] = useState<Record<string, Attachment[]>>({});
  const [commentsByRequest, setCommentsByRequest] = useState<Record<string, Comment[]>>({});
  const [tasksByRequest, setTasksByRequest] = useState<Record<string, Task[]>>({});
  const [assignmentsByRequest, setAssignmentsByRequest] = useState<Record<string, any[]>>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<typeof priorities[number]>("medium");
  const [clientId, setClientId] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Comment thread state
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [taskDraft, setTaskDraft] = useState("");

  const load = async () => {
    const [{ data: c }, { data: r }, { data: tl }, { data: at }, { data: cm }, { data: tk }] = await Promise.all([
      supabase.from("clients").select("id, name, company").order("name"),
      supabase.from("requests").select("*, clients(name)").order("created_at", { ascending: false }),
      supabase.from("time_logs").select("request_id, duration_seconds").not("request_id", "is", null),
      supabase.from("request_attachments").select("*").order("created_at", { ascending: false }),
      supabase.from("request_comments").select("*").order("created_at", { ascending: true }),
      supabase.from("request_tasks").select("*").order("created_at", { ascending: true }),
      supabase.from("team_members").select("*").order("name"),
      supabase.from("assigned_tasks").select("*, team_members(name)"),
    ]);
    setClients(c ?? []);
    setRequests((r ?? []) as Request[]);
    setMembers(m ?? []);
    const totals: Record<string, number> = {};
    (tl ?? []).forEach((row: any) => {
      if (!row.request_id) return;
      totals[row.request_id] = (totals[row.request_id] ?? 0) + (row.duration_seconds ?? 0);
    });
    setTrackedByRequest(totals);
    const attMap: Record<string, Attachment[]> = {};
    (at ?? []).forEach((a: any) => {
      attMap[a.request_id] = attMap[a.request_id] ?? [];
      attMap[a.request_id].push(a);
    });
    setAttachmentsByRequest(attMap);
    const cmMap: Record<string, Comment[]> = {};
    (cm ?? []).forEach((c: any) => {
      cmMap[c.request_id] = cmMap[c.request_id] ?? [];
      cmMap[c.request_id].push(c);
    });
    setCommentsByRequest(cmMap);
    const tkMap: Record<string, Task[]> = {};
    (tk ?? []).forEach((t: any) => {
      tkMap[t.request_id] = tkMap[t.request_id] ?? [];
      tkMap[t.request_id].push(t);
    });
    setTasksByRequest(tkMap);
    const asMap: Record<string, any[]> = {};
    (as ?? []).forEach((a: any) => {
      if (!a.request_id) return;
      asMap[a.request_id] = asMap[a.request_id] ?? [];
      asMap[a.request_id].push(a);
    });
    setAssignmentsByRequest(asMap);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removePending = (idx: number) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

  const uploadFiles = async (requestId: string, files: File[]) => {
    if (!user) return;
    for (const file of files) {
      const rel = (file as any).webkitRelativePath || file.name;
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${user.id}/${clientId || "no-client"}/${requestId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("request-attachments").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) {
        toast({ title: "Upload failed", description: `${file.name}: ${upErr.message}`, variant: "destructive" });
        continue;
      }
      await supabase.from("request_attachments").insert({
        request_id: requestId,
        client_id: clientId || null,
        user_id: user.id,
        uploaded_by: "owner",
        file_name: file.name,
        relative_path: rel,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
    }
  };

  const downloadAttachment = async (att: Attachment) => {
    const { data, error } = await supabase.storage
      .from("request-attachments")
      .createSignedUrl(att.storage_path, 60 * 5);
    if (error || !data) return toast({ title: "Error", description: error?.message ?? "Failed", variant: "destructive" });
    window.open(data.signedUrl, "_blank");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setLoading(true);
    const { data: created, error } = await supabase.from("requests").insert({
      user_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      client_id: clientId || null,
      due_at: dueAt || null,
    }).select().single();
    if (error || !created) {
      setLoading(false);
      return toast({ title: "Error", description: error?.message ?? "Failed", variant: "destructive" });
    }
    if (pendingFiles.length > 0) {
      toast({ title: "Uploading files…", description: `${pendingFiles.length} file(s)` });
      await uploadFiles(created.id, pendingFiles);
    }
    setLoading(false);
    toast({ title: "Request submitted", description: "New project request created." });
    setTitle(""); setDescription(""); setDueAt(""); setClientId(""); setPendingFiles([]);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("requests").delete().eq("id", id);
    load();
  };

  const setStatus = async (id: string, status: typeof statuses[number]) => {
    await supabase.from("requests").update({ status }).eq("id", id);
    load();
  };

  const trackRequest = (r: Request) => {
    navigate(`/time-tracker?requestId=${r.id}`);
  };

  const sendComment = async (requestId: string) => {
    if (!commentDraft.trim() || !user) return;
    setSendingComment(true);
    const req = requests.find((r) => r.id === requestId);
    const { error } = await supabase.from("request_comments").insert({
      request_id: requestId,
      client_id: req?.client_id || null,
      user_id: user.id,
      author: "owner",
      author_name: null,
      body: commentDraft.trim(),
    });
    setSendingComment(false);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setCommentDraft("");
    load();
  };

  const addTask = async (requestId: string) => {
    if (!taskDraft.trim() || !user) return;
    const req = requests.find((r) => r.id === requestId);
    await supabase.from("request_tasks").insert({
      request_id: requestId,
      client_id: req?.client_id || null,
      user_id: user.id,
      title: taskDraft.trim(),
    });
    setTaskDraft("");
    load();
  };

  const toggleTask = async (taskId: string, done: boolean) => {
    await supabase.from("request_tasks").update({ is_done: done }).eq("id", taskId);
    load();
  };

  const assignToTeamMember = async (t: Task, memberId: string) => {
    if (!user || !memberId) return;
    const req = requests.find(r => r.id === t.request_id);
    const { error } = await supabase.from("assigned_tasks").insert({
      user_id: user.id,
      team_member_id: memberId,
      request_id: t.request_id,
      client_id: req?.client_id || null,
      title: t.title,
      status: t.is_done ? "done" : "open"
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Task assigned", description: `Assigned to team member.` });
    load();
  };

  const removeAssignment = async (assignmentId: string) => {
    await supabase.from("assigned_tasks").delete().eq("id", assignmentId);
    load();
  };

  const priorityTone = (p: string) =>
    p === "high" ? "bg-destructive/10 text-destructive" :
    p === "medium" ? "bg-warning-soft text-warning-foreground" :
    "bg-brand-soft text-brand-soft-foreground";

  const statusTone = (s: string) =>
    s === "done" ? "bg-brand-soft text-brand-soft-foreground" :
    s === "in_progress" ? "bg-warning-soft text-warning-foreground" :
    "bg-secondary text-secondary-foreground";

  return (
    <AppLayout searchPlaceholder="Search requests...">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Project Requests</h1>
            <p className="text-muted-foreground mt-1">Submit work, then track time per task right from this page.</p>
          </div>
          <button onClick={() => navigate("/clients")} className="text-sm text-brand font-semibold hover:underline">+ Manage clients</button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <form onSubmit={submit} className="bg-card rounded-lg border border-border p-6 shadow-[var(--shadow-card)] space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 fleet optimization audit"
                className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                placeholder="Outline goals, deliverables, and constraints…"
                className="w-full p-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Client</label>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                  className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— None —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priorities[number])}
                  className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring capitalize">
                  {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Due date</label>
                <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
                  className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Attachments</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background hover:bg-secondary text-xs font-semibold">
                  <Paperclip className="h-3.5 w-3.5" /> Add files
                </button>
                <button type="button" onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background hover:bg-secondary text-xs font-semibold">
                  <FolderUp className="h-3.5 w-3.5" /> Add folder
                </button>
                <input ref={fileInputRef} type="file" multiple onChange={handleFilePick} className="hidden" />
                <input ref={folderInputRef} type="file" multiple onChange={handleFilePick} className="hidden"
                  // @ts-expect-error non-standard but widely supported
                  webkitdirectory="" directory="" />
              </div>
              {pendingFiles.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-auto rounded-md border border-border p-2">
                  {pendingFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <FileIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate flex-1">{(f as any).webkitRelativePath || f.name}</span>
                      <span className="tabular-nums">{(f.size / 1024).toFixed(1)} KB</span>
                      <button type="button" onClick={() => removePending(i)} className="text-destructive hover:underline">remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button disabled={loading} className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold disabled:opacity-50">
              <Send className="h-4 w-4" /> Submit Request
            </button>
          </form>

          <div className="bg-card rounded-lg border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold">Tasks & tracked time</h3>
              <span className="text-xs text-muted-foreground">{requests.length} total</span>
            </div>
            <div className="divide-y divide-border max-h-[640px] overflow-auto">
              {requests.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-muted-foreground">No requests yet.</div>
              ) : requests.map((r) => {
                const tracked = trackedByRequest[r.id] ?? 0;
                const atts = attachmentsByRequest[r.id] ?? [];
                const cmts = commentsByRequest[r.id] ?? [];
                const rTasks = tasksByRequest[r.id] ?? [];
                const isOpen = openRequestId === r.id;
                return (
                  <div key={r.id} className="px-6 py-4 hover:bg-secondary/30">
                    <button onClick={() => setOpenRequestId(isOpen ? null : r.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-foreground truncate">{r.title}</div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                            <span>{r.clients?.name ?? "No client"}</span>
                            <span>·</span>
                            <span>{r.due_at ? `Due ${new Date(r.due_at).toLocaleDateString()}` : "No due date"}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(tracked)} tracked</span>
                            {cmts.length > 0 && (<><span>·</span><span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{cmts.length}</span></>)}
                          </div>
                          {/* Latest message preview */}
                          {cmts.length > 0 && !isOpen && (() => {
                            const latest = cmts[cmts.length - 1];
                            const isSubmitMsg = latest.body.startsWith("Submitted by ");
                            const displayMsg = isSubmitMsg && cmts.length === 1 ? latest.body : (isSubmitMsg ? cmts[cmts.length - 2]?.body : latest.body);
                            if (!displayMsg) return null;
                            const sender = latest.author === "owner" ? "You" : (latest.author_name ?? "Client");
                            return (
                              <div className="mt-1.5 text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1 truncate">
                                <span className="font-semibold">{sender}:</span> {displayMsg.slice(0, 120)}{displayMsg.length > 120 ? "…" : ""}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${priorityTone(r.priority)}`}>{r.priority}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${statusTone(r.status)}`}>{r.status.replace("_", " ")}</span>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-4 space-y-4">
                        {/* Sub-tasks */}
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Sub-tasks ({rTasks.filter(t => t.is_done).length}/{rTasks.length})</div>
                          <div className="space-y-1.5">
                 {rTasks.map((t) => {
                   const assignment = (assignmentsByRequest[r.id] ?? []).find(a => a.title === t.title);
                   return (
                     <div key={t.id} className="group flex items-center gap-2 text-sm w-full text-left hover:bg-secondary/50 rounded px-1 py-0.5">
                       <button onClick={() => toggleTask(t.id, !t.is_done)} className="flex items-center gap-2 flex-1 min-w-0">
                         {t.is_done ? <CheckSquare className="h-4 w-4 text-brand shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                         <span className={`truncate ${t.is_done ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                       </button>
                       {assignment ? (
                         <div className="flex items-center gap-1 shrink-0">
                           <span className="text-[9px] bg-brand/10 text-brand px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                             {assignment.team_members?.name}
                           </span>
                           <button onClick={() => removeAssignment(assignment.id)} className="hidden group-hover:block text-muted-foreground hover:text-destructive p-0.5">
                             <Trash2 className="h-3 w-3" />
                           </button>
                         </div>
                       ) : (
                         <select 
                           className="hidden group-hover:block text-[10px] bg-background border border-border rounded px-1 h-6 focus:outline-none"
                           onChange={(e) => assignToTeamMember(t, e.target.value)}
                           value=""
                         >
                           <option value="" disabled>Assign...</option>
                           {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                         </select>
                       )}
                     </div>
                   );
                 })}
                            {rTasks.length === 0 && <p className="text-xs text-muted-foreground">No tasks yet.</p>}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <input value={taskDraft} onChange={(e) => setTaskDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(r.id); } }} placeholder="Add a task…" maxLength={200} className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            <button onClick={() => addTask(r.id)} disabled={!taskDraft.trim()} className="h-9 px-3 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold disabled:opacity-50"><Plus className="h-4 w-4" /></button>
                          </div>
                        </div>
                        {/* Attachments */}
                        {atts.length > 0 && (
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Files ({atts.length})</div>
                            <ul className="space-y-1">
                              {atts.map((a) => (
                                <li key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <FileIcon className="h-3 w-3 shrink-0" />
                                  <span className="truncate flex-1" title={a.relative_path ?? a.file_name}>{a.relative_path ?? a.file_name}</span>
                                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary">{a.uploaded_by}</span>
                                  <button onClick={() => downloadAttachment(a)} className="inline-flex items-center gap-1 text-brand hover:underline">
                                    <Download className="h-3 w-3" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Comment thread */}
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Messages</div>
                          <div className="space-y-2 max-h-60 overflow-auto">
                            {cmts.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No messages yet.</p>
                            ) : cmts.map((c) => (
                              <div key={c.id} className={`rounded-md p-3 text-sm ${c.author === "owner" ? "bg-brand-soft text-brand-soft-foreground" : "bg-secondary"}`}>
                                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">
                                  {c.author === "owner" ? "You" : (c.author_name ?? "Client")} · {new Date(c.created_at).toLocaleString()}
                                </div>
                                <div className="whitespace-pre-wrap">{c.body}</div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <input
                              value={isOpen ? commentDraft : ""}
                              onChange={(e) => setCommentDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(r.id); } }}
                              placeholder="Reply to client…"
                              className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            <button
                              onClick={() => sendComment(r.id)}
                              disabled={sendingComment || !commentDraft.trim()}
                              className="h-10 px-4 rounded-md bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold disabled:opacity-50"
                            >
                              Send
                            </button>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {r.status !== "done" && (
                            <button
                              onClick={() => trackRequest(r)}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-brand hover:bg-brand/90 text-brand-foreground text-xs font-semibold"
                            >
                              <Play className="h-3 w-3 fill-current" /> Track time
                            </button>
                          )}
                          {r.status !== "done" ? (
                            <button
                              onClick={() => setStatus(r.id, "done")}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border hover:bg-secondary text-xs font-semibold"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Mark done
                            </button>
                          ) : (
                            <button
                              onClick={() => setStatus(r.id, "open")}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border hover:bg-secondary text-xs font-semibold"
                            >
                              Reopen
                            </button>
                          )}
                          <button onClick={() => remove(r.id)} className="ml-auto h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default NewRequest;
