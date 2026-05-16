import { ListTodo, Play } from "lucide-react";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  clients?: { name: string } | null;
  requests?: { title: string } | null;
};

type Props = {
  tasks: Task[];
  pendingTasks: Task[];
  readyTasks: Task[];
  activeTasks: Task[];
  acceptingId: string | null;
  running: boolean;
  selectedTaskId: string;
  onAccept: (taskId: string, andStart: boolean) => void;
  onStartReady: (task: Task) => void;
};

export const TrackerAssignedTasks = ({
  tasks,
  pendingTasks,
  readyTasks,
  activeTasks,
  acceptingId,
  running,
  selectedTaskId,
  onAccept,
  onStartReady,
}: Props) => {
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
      <div className="px-8 py-5 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2 text-foreground/80">
          <ListTodo className="h-4 w-4" /> Assigned Tasks
        </h3>
        <span className="text-[10px] font-bold text-muted-foreground uppercase">{tasks.length} Total</span>
      </div>

      {pendingTasks.length > 0 && (
        <div className="border-b border-border/50">
          <div className="px-8 py-3 bg-amber-500/5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Awaiting your acceptance ({pendingTasks.length})
          </div>
          <div className="divide-y divide-border/50">
            {pendingTasks.map((t) => (
              <div key={t.id} className="px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/20">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t.title}</div>
                  {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-muted-foreground">
                    {t.requests?.title && <span>Project: {t.requests.title}</span>}
                    {t.clients?.name && <span>Client: {t.clients.name}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={acceptingId === t.id || running}
                    onClick={() => onAccept(t.id, false)}
                    className="h-9 px-4 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-semibold disabled:opacity-50"
                  >
                    {acceptingId === t.id ? "Accepting…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    disabled={acceptingId === t.id || running}
                    onClick={() => onAccept(t.id, true)}
                    className="h-9 px-4 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold disabled:opacity-50"
                  >
                    Accept & Start
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {readyTasks.length > 0 && (
        <div className="border-b border-border/50">
          <div className="px-8 py-3 bg-brand/5 text-[10px] font-bold uppercase tracking-wider text-brand">
            Ready to track ({readyTasks.length})
          </div>
          <div className="divide-y divide-border/50">
            {readyTasks.map((t) => (
              <div key={t.id} className="px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/20">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t.title}</div>
                  {t.requests?.title && <div className="text-[11px] text-muted-foreground mt-1">Project: {t.requests.title}</div>}
                </div>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => onStartReady(t)}
                  className="h-9 px-4 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Start
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTasks.length > 0 && (
        <div className="border-b border-border/50">
          <div className="px-8 py-3 bg-secondary/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            In progress ({activeTasks.length})
          </div>
          <div className="divide-y divide-border/50">
            {activeTasks.map((t) => (
              <div
                key={t.id}
                className={`px-8 py-4 flex items-center justify-between ${selectedTaskId === t.id ? "bg-brand/5" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t.title}</div>
                  {selectedTaskId === t.id && running && (
                    <span className="text-[10px] text-brand font-semibold">Currently tracking</span>
                  )}
                </div>
                <span className="text-[9px] font-bold uppercase px-2.5 py-1 rounded-lg bg-brand/10 text-brand">in progress</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {doneTasks.length > 0 && (
        <div>
          <div className="px-8 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Completed ({doneTasks.length})
          </div>
          <div className="divide-y divide-border/50 opacity-70">
            {doneTasks.map((t) => (
              <div key={t.id} className="px-8 py-3 flex items-center justify-between">
                <span className="text-sm line-through text-muted-foreground">{t.title}</span>
                <span className="text-[9px] font-bold uppercase text-emerald-500">done</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
