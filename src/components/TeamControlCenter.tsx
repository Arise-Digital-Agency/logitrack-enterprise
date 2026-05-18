import { useEffect, useState } from "react";
import { Clock, Activity, Users, FileText, Timer, Video, Camera, Monitor } from "lucide-react";

type TeamMember = {
  id: string;
  name: string;
  responsibility: string | null;
};

type Log = {
  id: string;
  description: string;
  duration_seconds: number;
  started_at: string;
  team_member_id: string;
  assigned_task_id: string | null;
  is_active?: boolean;
  tracking_mode?: string;
};

interface TeamControlCenterProps {
  teamMembers: TeamMember[];
  liveSessions: Log[];
  historicalLogs: Log[];
  onRefresh: () => void;
}

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

// Component to render a ticking timer for live sessions
const LiveTimer = ({ startedAt }: { startedAt: string }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();
    const update = () => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span className="font-mono tabular-nums text-emerald-500 font-bold">{fmt(elapsed)}</span>;
};

export const TeamControlCenter = ({
  teamMembers,
  liveSessions,
  historicalLogs,
  onRefresh,
}: TeamControlCenterProps) => {
  // Poll for new live sessions every 30 seconds
  useEffect(() => {
    const interval = setInterval(onRefresh, 30000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  const todayStr = new Date().toDateString();
  const todayLogs = historicalLogs.filter(l => new Date(l.started_at).toDateString() === todayStr);
  const totalTodaySeconds = todayLogs.reduce((sum, l) => sum + l.duration_seconds, 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card rounded-3xl border border-border p-6 shadow-xl shadow-black/5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active Right Now</p>
              <div className="text-3xl font-bold flex items-center gap-2">
                {liveSessions.length}
                {liveSessions.length > 0 && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-3xl border border-border p-6 shadow-xl shadow-black/5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Team Hours Today</p>
              <div className="text-3xl font-bold tabular-nums">{fmtHours(totalTodaySeconds)}</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-3xl border border-border p-6 shadow-xl shadow-black/5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Members</p>
              <div className="text-3xl font-bold">{teamMembers.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Live Sessions & Members */}
        <div className="space-y-8 lg:col-span-1">
          <div className="bg-card rounded-3xl border border-border shadow-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border/50 bg-secondary/20">
              <h3 className="font-bold flex items-center gap-2">
                <Timer className="h-4 w-4 text-emerald-500" /> Live Sessions
              </h3>
            </div>
            <div className="p-4 flex-1">
              {liveSessions.length === 0 ? (
                <div className="py-12 text-center opacity-50">
                  <Activity className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-xs font-medium">No one is tracking currently.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {liveSessions.map(session => {
                    const member = teamMembers.find(m => m.id === session.team_member_id);
                    const mode = session.tracking_mode || "standard";
                    return (
                      <div key={session.id} className="p-4 rounded-2xl border border-border/50 bg-background relative overflow-hidden group shadow-sm hover:shadow-md transition-all duration-300">
                        <div className={`absolute top-0 left-0 w-1.5 h-full ${mode === "recording" ? "bg-red-500" : mode === "auto-screenshot" ? "bg-amber-500" : "bg-emerald-500"}`} />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm truncate">{member?.name ?? "Unknown"}</span>
                              {mode === "recording" ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-red-500/10 text-red-500 animate-pulse border border-red-500/20">
                                  <Video className="h-2.5 w-2.5" /> Recording
                                </span>
                              ) : mode === "auto-screenshot" ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                  <Camera className="h-2.5 w-2.5" /> Screenshot
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                  <Monitor className="h-2.5 w-2.5" /> Standard
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1 truncate">{session.description}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <LiveTimer startedAt={session.started_at} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Historical Logs */}
        <div className="space-y-8 lg:col-span-2">
          <div className="bg-card rounded-3xl border border-border shadow-lg overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-border/50 flex items-center justify-between bg-secondary/20">
              <h3 className="font-bold flex items-center gap-2">
                <FileText className="h-4 w-4" /> Team Activity Feed
              </h3>
              <button onClick={onRefresh} className="text-xs font-semibold text-brand hover:underline">Refresh Feed</button>
            </div>
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="px-6 py-4">Member</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                        No team activity recorded yet.
                      </td>
                    </tr>
                  ) : historicalLogs.map((log) => {
                    const member = teamMembers.find(m => m.id === log.team_member_id);
                    const mode = log.tracking_mode || "standard";
                    return (
                      <tr key={log.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/10 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-brand-soft text-brand-soft-foreground grid place-items-center text-[9px] font-bold">
                              {member?.name.slice(0, 2).toUpperCase() ?? "??"}
                            </div>
                            <span className="font-medium">{member?.name ?? "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium truncate max-w-[200px]" title={log.description}>{log.description}</span>
                            <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60">{mode} session</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-xs whitespace-nowrap">
                          {new Date(log.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 text-right font-mono tabular-nums font-bold">
                          {fmtHours(log.duration_seconds)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
