import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Send, Paperclip, FolderUp, FileIcon, Download, Clock, MessageSquare, Building2, AlertCircle, Plus, CheckSquare, Square, Users, CalendarDays, Moon, Sun } from "lucide-react";
import { toast } from "sonner";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-portal`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf","doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp",
  "txt","csv","rtf","md",
  "jpg","jpeg","png","gif","webp","svg","bmp","tiff",
  "mp4","mov","avi","mkv","webm",
  "mp3","wav","ogg","m4a",
  "zip","rar","7z","tar","gz",
  "json","xml","yaml","yml",
]);

const validateFile = (file: File): string | null => {
  if (file.size > MAX_FILE_SIZE) return `${file.name} exceeds 5 GB limit`;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) return `${file.name}: .${ext} files are not allowed`;
  return null;
};

type Request = { id: string; title: string; description: string | null; priority: string; status: string; due_at: string | null; created_at: string; client_last_read_at: string | null };
type Attachment = { id: string; request_id: string; file_name: string; relative_path: string | null; storage_path: string; uploaded_by: string; size_bytes: number | null; created_at: string };
type Comment = { id: string; request_id: string; author: string; author_name: string | null; body: string; created_at: string };
type Task = { id: string; request_id: string; title: string; is_done: boolean; created_at: string };
type TeamReportEntry = { started_at: string; description: string; duration_seconds: number; task_title: string | null; request_title: string | null };
type TeamReportMember = { id: string; name: string; total_seconds: number; entries: TeamReportEntry[] };
type TeamDailyReport = { date: string; members: TeamReportMember[] };

const fmtDur = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); if (h === 0 && m === 0) return "0m"; return `${h > 0 ? `${h}h ` : ""}${m}m`; };
const fmtSize = (bytes: number | null) => { if (!bytes) return ""; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; };

const priorityTone = (p: string) => p === "high" ? "bg-destructive/10 text-destructive" : p === "medium" ? "bg-warning-soft text-warning-foreground" : "bg-brand-soft text-brand-soft-foreground";
const statusTone = (s: string) => s === "done" ? "bg-brand-soft text-brand-soft-foreground" : s === "in_progress" ? "bg-warning-soft text-warning-foreground" : "bg-secondary text-secondary-foreground";

const ClientPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<{ id: string; name: string; company: string | null } | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [tracked, setTracked] = useState<Record<string, number>>({});
  const [taskSummaries, setTaskSummaries] = useState<Record<string, number>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains("dark"));

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [teamDailyReport, setTeamDailyReport] = useState<TeamDailyReport | null>(null);

  const call = async (op: string | null, body?: any, method: "GET" | "POST" = "POST", reportDateParam?: string) => {
    const params = new URLSearchParams({ token: token! });
    if (op) params.set("op", op);
    if (method === "GET" && reportDateParam) params.set("report_date", reportDateParam);
    const res = await fetch(`${FN_URL}?${params.toString()}`, {
      method,
      headers: { "Content-Type": "application/json", "apikey": ANON, "Authorization": `Bearer ${ANON}` },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Request failed");
    return json;
  };

  const refresh = async (date = reportDate) => {
    try {
      const data = await call(null, undefined, "GET", date);
      setClient(data.client);
      setRequests(data.requests);
      setTracked(data.tracked);
      setTaskSummaries(data.taskSummaries ?? {});
      setAttachments(data.attachments);
      setComments(data.comments);
      setTasks(data.tasks ?? []);
      setActiveTasks(data.activeTasks ?? []);
      setUnread(data.unread ?? {});
      setTeamDailyReport(data.teamDailyReport ?? { date, members: [] });
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!token) return;
    refresh(reportDate);
    const iv = setInterval(() => refresh(reportDate), 15_000);
    return () => clearInterval(iv);
  }, [token, reportDate]);

  const openRequest = async (id: string) => {
    if (openRequestId === id) { setOpenRequestId(null); setCommentDraft(""); setTaskDraft(""); return; }
    setOpenRequestId(id);
    setCommentDraft("");
    setTaskDraft("");
    if (unread[id]) {
      try { await call("mark_read", { request_id: id }); setUnread((u) => { const n = { ...u }; delete n[id]; return n; }); } catch {}
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const errors: string[] = []; const valid: File[] = [];
    for (const f of files) { const err = validateFile(f); if (err) errors.push(err); else valid.push(f); }
    if (errors.length) setFileErrors((p) => [...p, ...errors]);
    if (valid.length) setPendingFiles((p) => [...p, ...valid]);
    e.target.value = "";
  };

  const removePending = (i: number) => setPendingFiles((p) => p.filter((_, idx) => idx !== i));

  const uploadOne = async (requestId: string, file: File) => {
    const rel = (file as any).webkitRelativePath || file.name;
    const sign = await call("sign_upload", { request_id: requestId, file_name: file.name, relative_path: rel });
    const putRes = await fetch(sign.signedUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    if (!putRes.ok) throw new Error(`Upload failed: ${file.name}`);
    await call("add_attachment", { request_id: requestId, file_name: file.name, storage_path: sign.storage_path, relative_path: rel, mime_type: file.type || null, size_bytes: file.size });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const { request } = await call("create_request", { title: title.trim(), description: description.trim() || null, priority, due_at: dueAt || null, author_name: client?.name || null });
      if (pendingFiles.length > 0) {
        toast.message(`Uploading ${pendingFiles.length} file(s)…`);
        let failed = 0;
        for (const f of pendingFiles) { try { await uploadOne(request.id, f); } catch { failed++; } }
        if (failed > 0) toast.warning(`${failed} file(s) failed`);
      }
      toast.success("Request submitted");
      setTitle(""); setDescription(""); setDueAt(""); setPendingFiles([]); setFileErrors([]);
      await refresh();
    } catch (e: any) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const addComment = async (requestId: string) => {
    if (!commentDraft.trim()) return;
    try { await call("add_comment", { request_id: requestId, body: commentDraft.trim(), author_name: client?.name || null }); setCommentDraft(""); await refresh(); } catch (e: any) { toast.error(e.message); }
  };

  const addTask = async (requestId: string) => {
    if (!taskDraft.trim()) return;
    try { await call("create_task", { request_id: requestId, title: taskDraft.trim() }); setTaskDraft(""); await refresh(); } catch (e: any) { toast.error(e.message); }
  };

  const toggleTask = async (taskId: string, done: boolean) => {
    try { await call("toggle_task", { task_id: taskId, is_done: done }); await refresh(); } catch (e: any) { toast.error(e.message); }
  };

  const downloadAttachment = async (att: Attachment) => {
    try { const { url } = await call("sign_download", { attachment_id: att.id }); window.open(url, "_blank"); } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!client) return <div className="min-h-screen grid place-items-center bg-background p-6"><div className="max-w-md text-center space-y-2"><h1 className="text-2xl font-bold">Invalid or expired link</h1><p className="text-muted-foreground">Please contact your project lead for a fresh link.</p></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-brand-soft text-brand-soft-foreground grid place-items-center"><Building2 className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-bold">{client.name}'s portal</h1>
              <p className="text-xs text-muted-foreground">{client.company ?? "Submit and track your requests"}</p>
            </div>
          </div>
          <button 
            onClick={toggleTheme}
            className="h-10 w-10 rounded-xl bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors"
            title="Toggle theme"
          >
            {isDark ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-slate-700" />}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <form onSubmit={submit} className="bg-card rounded-lg border border-border p-6 shadow-[var(--shadow-card)] space-y-5 h-fit">
          <div><h2 className="font-bold text-lg">New request</h2><p className="text-xs text-muted-foreground">Tell us what you need.</p></div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title *</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={5000} className="w-full p-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Needed by</label>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Attachments</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background hover:bg-secondary text-xs font-semibold"><Paperclip className="h-3.5 w-3.5" /> Add files</button>
              <button type="button" onClick={() => folderInputRef.current?.click()} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background hover:bg-secondary text-xs font-semibold"><FolderUp className="h-3.5 w-3.5" /> Add folder</button>
              <input ref={fileInputRef} type="file" multiple onChange={handleFilePick} className="hidden" />
              <input ref={folderInputRef} type="file" multiple onChange={handleFilePick} className="hidden"
                // @ts-expect-error non-standard
                webkitdirectory="" directory="" />
            </div>
            {fileErrors.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-1">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Some files were rejected</span><button type="button" onClick={() => setFileErrors([])} className="text-[10px] text-destructive hover:underline">dismiss</button></div>
                {fileErrors.map((err, i) => <p key={i} className="text-xs text-destructive/80">• {err}</p>)}
              </div>
            )}
            {pendingFiles.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-auto rounded-md border border-border p-2">
                {pendingFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2"><FileIcon className="h-3 w-3 shrink-0" /><span className="truncate flex-1">{(f as any).webkitRelativePath || f.name}</span><span className="tabular-nums">{fmtSize(f.size)}</span><button type="button" onClick={() => removePending(i)} className="text-destructive hover:underline">remove</button></li>
                ))}
              </ul>
            )}
          </div>
          <button disabled={submitting} className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit
          </button>
        </form>

        <section className="bg-card rounded-lg border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-bold">Your requests</h2>
            <span className="text-xs text-muted-foreground">{requests.length} total</span>
          </div>
          <div className="divide-y divide-border max-h-[720px] overflow-auto">
            {requests.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">No requests yet. Submit your first one!</div>
            ) : requests.map((r) => {
              const atts = attachments.filter((a) => a.request_id === r.id);
              const cmts = comments.filter((c) => c.request_id === r.id);
              const rTasks = tasks.filter((t) => t.request_id === r.id);
              const isOpen = openRequestId === r.id;
              const unreadCount = unread[r.id] ?? 0;
              return (
                <div key={r.id} className="px-6 py-4">
                  <button onClick={() => openRequest(r.id)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate flex items-center gap-2">
                          {r.title}
                          {unreadCount > 0 && (
                            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-brand text-brand-foreground text-[10px] font-bold">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span>{new Date(r.created_at).toLocaleDateString()}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDur(tracked[r.id] ?? 0)} tracked</span>
                          {cmts.length > 0 && (<><span>·</span><span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{cmts.length}</span></>)}
                          {atts.length > 0 && (<><span>·</span><span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{atts.length} file{atts.length !== 1 ? "s" : ""}</span></>)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${priorityTone(r.priority)}`}>{r.priority}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${statusTone(r.status)}`}>{r.status.replace("_", " ")}</span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-4 space-y-4">
                      {r.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>}

                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Tasks</div>
                        <div className="space-y-1.5">
                          {rTasks.map((t) => (
                            <button key={t.id} onClick={() => toggleTask(t.id, !t.is_done)} className="flex items-center gap-2 text-sm w-full text-left hover:bg-secondary/50 rounded px-1 py-0.5">
                              {t.is_done ? <CheckSquare className="h-4 w-4 text-brand shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                              <span className={t.is_done ? "line-through text-muted-foreground" : ""}>{t.title}</span>
                            </button>
                          ))}
                          {rTasks.length === 0 && <p className="text-xs text-muted-foreground">No tasks yet.</p>}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <input value={taskDraft} onChange={(e) => setTaskDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(r.id); } }} placeholder="Add a task…" maxLength={200} className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                          <button onClick={() => addTask(r.id)} disabled={!taskDraft.trim()} className="h-9 px-3 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold disabled:opacity-50"><Plus className="h-4 w-4" /></button>
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Conversation & files</div>
                        <div className="space-y-2 max-h-72 overflow-auto">
                          {cmts.length === 0 && atts.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No messages or files yet.</p>
                          ) : (
                            <>
                              {cmts.map((c) => (
                                <div key={c.id} className={`rounded-md p-3 text-sm ${c.author === "owner" ? "bg-brand-soft text-brand-soft-foreground" : "bg-secondary"}`}>
                                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">
                                    {c.author === "owner" ? "Team" : (c.author_name ?? "You")} · {new Date(c.created_at).toLocaleString()}
                                  </div>
                                  <div className="whitespace-pre-wrap">{c.body}</div>
                                </div>
                              ))}
                              {atts.length > 0 && (
                                <div className="rounded-md border border-border p-3">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Attachments</div>
                                  <ul className="space-y-1">
                                    {atts.map((a) => (
                                      <li key={a.id} className="flex items-center gap-2 text-xs">
                                        <FileIcon className="h-3 w-3 shrink-0" />
                                        <span className="truncate flex-1">{a.relative_path ?? a.file_name}</span>
                                        {a.size_bytes && <span className="text-muted-foreground tabular-nums">{fmtSize(a.size_bytes)}</span>}
                                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary">{a.uploaded_by}</span>
                                        <button onClick={() => downloadAttachment(a)} className="text-brand hover:underline inline-flex items-center gap-1"><Download className="h-3 w-3" /> Download</button>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <input value={isOpen ? commentDraft : ""} onChange={(e) => setCommentDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(r.id); } }} placeholder="Write a message…" maxLength={5000} className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                          <button onClick={() => addComment(r.id)} disabled={!commentDraft.trim()} className="h-10 px-4 rounded-md bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold disabled:opacity-50">Send</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Real-time Work Status */}
        <section className="bg-card rounded-lg border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-brand/5">
            <div>
              <h2 className="font-bold flex items-center gap-2 text-brand"><Clock className="h-4 w-4" /> Current Work & Status</h2>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Real-time team updates</p>
            </div>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-brand/10 text-brand animate-pulse">Live</span>
          </div>
          <div className="divide-y divide-border">
            {activeTasks.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground italic">No active tasks currently tracked.</div>
            ) : activeTasks.map((at) => {
              const time = taskSummaries[at.id] ?? 0;
              return (
                <div key={at.id} className="px-6 py-4 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{at.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="h-5 w-5 rounded-full bg-brand/10 text-brand grid place-items-center text-[8px] font-bold">
                          {at.team_members?.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="text-[11px]">
                          <span className="font-bold text-foreground/80">{at.team_members?.name}</span>
                          {at.team_members?.responsibility && (
                            <span className="text-muted-foreground ml-1.5">· {at.team_members.responsibility}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <div className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${statusTone(at.status)}`}>
                        {at.status.replace("_", " ")}
                      </div>
                      <div className="text-xs font-mono font-bold text-brand tabular-nums">{fmtDur(time)} tracked</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-2 bg-card rounded-lg border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Team activity</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Daily hours from your assigned team members (no billing details).</p>
            </div>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="h-10 pl-10 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="p-6 space-y-6 max-h-[600px] overflow-auto">
            {!teamDailyReport || teamDailyReport.members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No team time logged for this date.</p>
            ) : (
              teamDailyReport.members.map((m) => (
                <div key={m.id} className="rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-3 bg-secondary/40 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">{m.name}</span>
                      {m.responsibility && <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">{m.responsibility}</span>}
                    </div>
                    <span className="text-sm font-bold text-brand tabular-nums">{fmtDur(m.total_seconds)}</span>
                  </div>
                  {m.entries.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">No entries</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {m.entries.map((e, i) => (
                        <li key={i} className="px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div>
                            <div className="font-medium">{e.description}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {new Date(e.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              {e.task_title && <> · Task: {e.task_title}</>}
                              {e.request_title && <> · Project: {e.request_title}</>}
                            </div>
                          </div>
                          <span className="text-xs font-semibold tabular-nums shrink-0">{fmtDur(e.duration_seconds)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ClientPortal;
