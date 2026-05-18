import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// assigned_tasks.status: open | accepted | in_progress | done
const TRACKABLE_STATUSES = ["accepted", "in_progress"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return json({ error: "Missing token" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: member, error: memberErr } = await admin
    .from("team_members")
    .select("id, name, email, user_id, client_id, responsibility, role")
    .eq("share_token", token)
    .maybeSingle();

  if (memberErr || !member) return json({ error: "Invalid token" }, 404);

  try {
    if (req.method === "GET") {
      const [{ data: tasks }, { data: logs }] = await Promise.all([
        admin.from("assigned_tasks")
          .select("id, title, description, status, accepted_at, created_at, client_id, request_id, clients(name), requests(title)")
          .eq("team_member_id", member.id)
          .order("created_at", { ascending: false }),
        admin.from("time_logs")
          .select("id, description, duration_seconds, started_at, assigned_task_id, tracking_mode")
          .eq("team_member_id", member.id)
          .order("started_at", { ascending: false })
          .limit(50),
      ]);

      const allTasks = tasks ?? [];
      const pendingTasks = allTasks.filter((t: { status: string }) => t.status === "open");
      const activeTasks = allTasks.filter((t: { status: string }) =>
        TRACKABLE_STATUSES.includes(t.status)
      );

      let managerData = {};
      if (member.role === "manager") {
         const [{data: tMembers}, {data: activeLogs}, {data: histLogs}] = await Promise.all([
            admin.from("team_members").select("id, name, responsibility").eq("user_id", member.user_id),
            admin.from("time_logs").select("id, description, duration_seconds, started_at, team_member_id, assigned_task_id, tracking_mode").eq("user_id", member.user_id).eq("is_active", true),
            admin.from("time_logs").select("id, description, duration_seconds, started_at, team_member_id, assigned_task_id, tracking_mode").eq("user_id", member.user_id).eq("is_active", false).order("started_at", { ascending: false }).limit(100),
         ]);
         managerData = {
           teamMembers: tMembers ?? [],
           liveSessions: activeLogs ?? [],
           historicalLogs: histLogs ?? []
         };
      }

      return json({
        member: { id: member.id, name: member.name, responsibility: member.responsibility, role: member.role },
        tasks: allTasks,
        pendingTasks,
        activeTasks,
        logs: logs ?? [],
        ...managerData
      });
    }

    const op = url.searchParams.get("op");
    const body = await req.json().catch(() => ({}));

    if (op === "add_task") {
      const { title } = body;
      if (!title || typeof title !== "string") return json({ error: "Title required" }, 400);

      const { data, error } = await admin.from("assigned_tasks").insert({
        user_id: member.user_id,
        team_member_id: member.id,
        client_id: member.client_id,
        title: title.trim(),
        status: "accepted",
        accepted_at: new Date().toISOString(),
      }).select().single();

      if (error) return json({ error: error.message }, 400);
      return json({ task: data });
    }

    if (op === "accept_task") {
      const { assigned_task_id } = body;
      if (!assigned_task_id) return json({ error: "Task ID required" }, 400);

      const { data: task, error: fetchErr } = await admin.from("assigned_tasks")
        .select("id, status")
        .eq("id", assigned_task_id)
        .eq("team_member_id", member.id)
        .maybeSingle();

      if (fetchErr || !task) return json({ error: "Task not found" }, 404);
      if (task.status !== "open") return json({ error: "Task is not awaiting acceptance" }, 400);

      const { data: updated, error } = await admin.from("assigned_tasks")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", assigned_task_id)
        .select("id, title, description, status, accepted_at, created_at, client_id, request_id, clients(name), requests(title)")
        .single();

      if (error) return json({ error: error.message }, 400);
      return json({ task: updated });
    }

    if (op === "start_log") {
      const { assigned_task_id, description, tracking_mode } = body;
      if (!description || typeof description !== "string") return json({ error: "Description required" }, 400);

      let client_id: string | null = member.client_id ?? null;
      let request_id: string | null = null;
      let hourly_rate: number | null = null;

      if (assigned_task_id) {
        const { data: task } = await admin.from("assigned_tasks")
          .select("id, status, client_id, request_id")
          .eq("id", assigned_task_id)
          .eq("team_member_id", member.id)
          .maybeSingle();
        if (!task) return json({ error: "Task not found" }, 404);
        if (!TRACKABLE_STATUSES.includes(task.status)) {
          return json({ error: "Accept the assignment before starting the timer" }, 400);
        }
        
        client_id = task.client_id ?? client_id;
        request_id = task.request_id;
        
        if (task.status === "accepted") {
          await admin.from("assigned_tasks").update({ status: "in_progress" }).eq("id", assigned_task_id);
        }
      }

      if (client_id) {
        const { data: cl } = await admin.from("clients").select("hourly_rate").eq("id", client_id).maybeSingle();
        hourly_rate = cl?.hourly_rate ?? null;
      }

      const { data: newLog, error } = await admin.from("time_logs").insert({
        user_id: member.user_id,
        team_member_id: member.id,
        assigned_task_id: assigned_task_id || null,
        request_id: request_id || null,
        client_id,
        description: String(description).slice(0, 200),
        duration_seconds: 0,
        started_at: new Date().toISOString(),
        hourly_rate: hourly_rate ?? 0,
        billable: (hourly_rate ?? 0) > 0,
        is_active: true,
        tracking_mode: tracking_mode || "standard",
      }).select("id").single();
      
      if (error) return json({ error: error.message }, 400);

      return json({ ok: true, active_log_id: newLog.id });
    }

    if (op === "save_log") {
      const { assigned_task_id, description, duration_seconds, started_at, active_log_id } = body;
      if (!description || typeof description !== "string") return json({ error: "Description required" }, 400);
      if (!duration_seconds || duration_seconds < 1) return json({ error: "Invalid duration" }, 400);

      let client_id: string | null = member.client_id ?? null;
      let request_id: string | null = null;
      let hourly_rate: number | null = null;

      if (assigned_task_id) {
        const { data: task } = await admin.from("assigned_tasks")
          .select("id, client_id, request_id, status")
          .eq("id", assigned_task_id)
          .eq("team_member_id", member.id)
          .maybeSingle();
        if (!task) return json({ error: "Task not found" }, 404);
        if (task.status === "open") {
          return json({ error: "Accept the assignment before logging time" }, 400);
        }
        if (task.status === "done") {
          return json({ error: "This assignment is already completed" }, 400);
        }
        if (!TRACKABLE_STATUSES.includes(task.status)) {
          return json({ error: "Invalid task status" }, 400);
        }

        client_id = task.client_id ?? client_id;
        request_id = task.request_id;

        if (task.status === "accepted") {
          await admin.from("assigned_tasks").update({ status: "in_progress" }).eq("id", assigned_task_id);
        }

        if (client_id) {
          const { data: cl } = await admin.from("clients").select("hourly_rate").eq("id", client_id).maybeSingle();
          hourly_rate = cl?.hourly_rate ?? null;
        }
      } else if (client_id) {
        const { data: cl } = await admin.from("clients").select("hourly_rate").eq("id", client_id).maybeSingle();
        hourly_rate = cl?.hourly_rate ?? null;
      }

      let logData;
      let logError;

      if (active_log_id) {
        const { data, error } = await admin.from("time_logs").update({
          duration_seconds: Math.min(duration_seconds, 86400),
          is_active: false,
        }).eq("id", active_log_id).eq("team_member_id", member.id).select().single();
        logData = data;
        logError = error;
      } else {
        const { data, error } = await admin.from("time_logs").insert({
          user_id: member.user_id,
          team_member_id: member.id,
          assigned_task_id: assigned_task_id || null,
          request_id: request_id || null,
          client_id,
          description: String(description).slice(0, 200),
          duration_seconds: Math.min(duration_seconds, 86400),
          started_at: started_at || new Date().toISOString(),
          hourly_rate: hourly_rate ?? 0,
          billable: (hourly_rate ?? 0) > 0,
          is_active: false,
        }).select().single();
        logData = data;
        logError = error;
      }

      if (logError) return json({ error: logError.message }, 400);

      if (body.mark_done && assigned_task_id) {
        await admin.from("assigned_tasks").update({ status: "done" }).eq("id", assigned_task_id);
      }

      return json({ log: logData });
    }

    if (op === "delete_log") {
      const { id } = body;
      if (!id) return json({ error: "ID required" }, 400);
      const { error } = await admin.from("time_logs")
        .delete()
        .eq("id", id)
        .eq("team_member_id", member.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown op" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
