import { ReactNode, useEffect, useRef, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { CaptureWidget } from "./CaptureWidget";
import { Bell, MessageSquare, History, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type RecentComment = { id: string; body: string; author: string; author_name: string | null; created_at: string; request_title?: string };
type RecentLog = { id: string; description: string; duration_seconds: number; started_at: string; client_name?: string };

const fmtDur = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

export const AppLayout = ({ children, searchPlaceholder = "Search..." }: { children: ReactNode; searchPlaceholder?: string }) => {
  const { user } = useAuth();
  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  const [openPanel, setOpenPanel] = useState<"bell" | "history" | "messages" | null>(null);
  const [recentComments, setRecentComments] = useState<RecentComment[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpenPanel(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadComments = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("request_comments")
      .select("id, body, author, author_name, created_at, request_id")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!data) return;
    // Fetch request titles
    const reqIds = [...new Set(data.map((c) => c.request_id))];
    const { data: reqs } = await supabase.from("requests").select("id, title").in("id", reqIds);
    const titleMap: Record<string, string> = {};
    (reqs ?? []).forEach((r: any) => { titleMap[r.id] = r.title; });
    setRecentComments(data.map((c) => ({ ...c, request_title: titleMap[c.request_id] ?? "Unknown" })));
    // Unread = client comments in last 24h
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    setUnreadCount(data.filter((c) => c.author === "client" && c.created_at > yesterday).length);
  };

  const loadLogs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("time_logs")
      .select("id, description, duration_seconds, started_at, client_id")
      .order("started_at", { ascending: false })
      .limit(20);
    if (!data) return;
    const clientIds = [...new Set(data.map((l) => l.client_id).filter(Boolean))];
    let nameMap: Record<string, string> = {};
    if (clientIds.length) {
      const { data: cls } = await supabase.from("clients").select("id, name").in("id", clientIds);
      (cls ?? []).forEach((c: any) => { nameMap[c.id] = c.name; });
    }
    setRecentLogs(data.map((l) => ({ ...l, client_name: l.client_id ? nameMap[l.client_id] : undefined })));
  };

  useEffect(() => { if (user) { loadComments(); loadLogs(); } }, [user]);

  const toggle = (panel: "bell" | "history" | "messages") => {
    if (openPanel === panel) { setOpenPanel(null); return; }
    setOpenPanel(panel);
    if (panel === "bell" || panel === "messages") loadComments();
    if (panel === "history") loadLogs();
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-4 border-b border-border bg-card px-6 h-16 shrink-0">
          <div className="flex-1" />
          <div className="flex items-center gap-1 text-muted-foreground relative" ref={panelRef}>
            {/* Bell */}
            <button onClick={() => toggle("bell")} className="relative h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && <span className="absolute top-1 right-1 h-4 min-w-[16px] px-1 rounded-full bg-brand text-brand-foreground text-[9px] font-bold grid place-items-center">{unreadCount}</span>}
            </button>
            {/* History */}
            <button onClick={() => toggle("history")} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary"><History className="h-4 w-4" /></button>
            {/* Messages */}
            <button onClick={() => toggle("messages")} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary"><MessageSquare className="h-4 w-4" /></button>

            {/* Dropdown panels */}
            {openPanel && (
              <div className="absolute top-12 right-0 w-80 max-h-96 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-bold capitalize">{openPanel === "bell" ? "Notifications" : openPanel === "history" ? "Time log history" : "Messages"}</h3>
                  <button onClick={() => setOpenPanel(null)} className="h-6 w-6 grid place-items-center rounded hover:bg-secondary"><X className="h-3.5 w-3.5" /></button>
                </div>
                <div className="overflow-auto max-h-80 divide-y divide-border">
                  {openPanel === "bell" && (
                    recentComments.filter((c) => c.author === "client").length === 0
                      ? <p className="px-4 py-8 text-xs text-muted-foreground text-center">No client notifications</p>
                      : recentComments.filter((c) => c.author === "client").map((c) => (
                        <div key={c.id} className="px-4 py-3 hover:bg-secondary/30">
                          <div className="text-xs font-semibold truncate">{c.author_name ?? "Client"} on {c.request_title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.body}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString()}</div>
                        </div>
                      ))
                  )}
                  {openPanel === "messages" && (
                    recentComments.length === 0
                      ? <p className="px-4 py-8 text-xs text-muted-foreground text-center">No messages yet</p>
                      : recentComments.map((c) => (
                        <div key={c.id} className="px-4 py-3 hover:bg-secondary/30">
                          <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.author === "owner" ? "bg-brand" : "bg-warning-foreground"}`} />
                            {c.author === "owner" ? "You" : (c.author_name ?? "Client")} · {c.request_title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.body}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString()}</div>
                        </div>
                      ))
                  )}
                  {openPanel === "history" && (
                    recentLogs.length === 0
                      ? <p className="px-4 py-8 text-xs text-muted-foreground text-center">No time logs yet</p>
                      : recentLogs.map((l) => (
                        <div key={l.id} className="px-4 py-3 hover:bg-secondary/30">
                          <div className="text-xs font-semibold truncate">{l.description}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span>{fmtDur(l.duration_seconds)}</span>
                            {l.client_name && <><span>·</span><span>{l.client_name}</span></>}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">{new Date(l.started_at).toLocaleString()}</div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="h-8 w-px bg-border mx-1" />
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-foreground leading-tight">{user?.email?.split("@")[0]}</div>
              <div className="text-xs text-muted-foreground">Logistics Manager</div>
            </div>
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand to-brand/70 grid place-items-center text-brand-foreground text-xs font-semibold">
              {initials}
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
      <CaptureWidget />
    </div>
  );
};
