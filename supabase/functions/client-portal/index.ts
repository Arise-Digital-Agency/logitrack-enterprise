// Public client portal API. Validates share_token on every request.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function dayBounds(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function buildTeamDailyReport(
  admin: ReturnType<typeof createClient>,
  clientId: string,
  dateStr: string,
) {
  const { start, end } = dayBounds(dateStr);

  const { data: members } = await admin
    .from("team_members")
    .select("id, name, responsibility")
    .eq("client_id", clientId)
    .order("name");

  if (!members?.length) {
    return { date: dateStr, members: [] };
  }

  const memberIds = members.map((m: { id: string }) => m.id);

  const { data: logs } = await admin
    .from("time_logs")
    .select(`
      id, team_member_id, description, duration_seconds, started_at, assigned_task_id,
      assigned_tasks(title),
      requests(title)
    `)
    .eq("client_id", clientId)
    .in("team_member_id", memberIds)
    .gte("started_at", start)
    .lt("started_at", end)
    .order("started_at", { ascending: true });

  const byMember: Record<string, {
    id: string;
    name: string;
    total_seconds: number;
    entries: Array<{
      started_at: string;
      description: string;
      duration_seconds: number;
      task_title: string | null;
      request_title: string | null;
    }>;
  }> = {};

  for (const m of members) {
    byMember[m.id] = { id: m.id, name: m.name, responsibility: (m as any).responsibility, total_seconds: 0, entries: [] };
  }

  for (const log of logs ?? []) {
    const mid = (log as { team_member_id: string }).team_member_id;
    if (!mid || !byMember[mid]) continue;
    const at = (log as { assigned_tasks?: { title: string } | null }).assigned_tasks;
    const req = (log as { requests?: { title: string } | null }).requests;
    byMember[mid].total_seconds += (log as { duration_seconds: number }).duration_seconds ?? 0;
    byMember[mid].entries.push({
      started_at: (log as { started_at: string }).started_at,
      description: (log as { description: string }).description,
      duration_seconds: (log as { duration_seconds: number }).duration_seconds ?? 0,
      task_title: at?.title ?? null,
      request_title: req?.title ?? null,
    });
  }

  return {
    date: dateStr,
    members: Object.values(byMember),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return json({ error: "Missing token" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("id, name, company, color, hourly_rate, user_id")
    .eq("share_token", token)
    .maybeSingle();

  if (clientErr || !client) return json({ error: "Invalid token" }, 404);

  try {
    if (req.method === "GET") {
      const reportDate = url.searchParams.get("report_date")
        ?? new Date().toISOString().slice(0, 10);

      const [{ data: requests }, { data: timeLogs }, { data: attachments }, { data: comments }, { data: tasks }, { data: activeTasks }, teamDailyReport] = await Promise.all([
        admin.from("requests").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
        admin.from("time_logs").select("request_id, assigned_task_id, duration_seconds").eq("client_id", client.id),
        admin.from("request_attachments").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
        admin.from("request_comments").select("*").eq("client_id", client.id).order("created_at", { ascending: true }),
        admin.from("request_tasks").select("*").eq("client_id", client.id).order("created_at", { ascending: true }),
        admin.from("assigned_tasks")
          .select("id, title, status, team_member_id, team_members(name, responsibility)")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false }),
        buildTeamDailyReport(admin, client.id, reportDate),
      ]);

      const tracked: Record<string, number> = {};
      const taskSummaries: Record<string, number> = {};
      (timeLogs ?? []).forEach((r: { request_id: string | null; assigned_task_id: string | null; duration_seconds: number }) => {
        if (r.request_id) {
          tracked[r.request_id] = (tracked[r.request_id] ?? 0) + (r.duration_seconds ?? 0);
        }
        if (r.assigned_task_id) {
          taskSummaries[r.assigned_task_id] = (taskSummaries[r.assigned_task_id] ?? 0) + (r.duration_seconds ?? 0);
        }
      });

      const unread: Record<string, number> = {};
      (requests ?? []).forEach((req: { id: string; client_last_read_at: string | null }) => {
        const lastRead = req.client_last_read_at ? new Date(req.client_last_read_at).getTime() : 0;
        const ownerMsgs = (comments ?? []).filter(
          (c: { request_id: string; author: string; created_at: string }) =>
            c.request_id === req.id && c.author === "owner" && new Date(c.created_at).getTime() > lastRead
        );
        if (ownerMsgs.length > 0) unread[req.id] = ownerMsgs.length;
      });

      return json({
        client: { id: client.id, name: client.name, company: client.company, color: client.color },
        requests: requests ?? [],
        tracked,
        taskSummaries,
        attachments: attachments ?? [],
        comments: comments ?? [],
        tasks: tasks ?? [],
        activeTasks: activeTasks ?? [],
        unread,
        teamDailyReport,
      });
    }

    const op = url.searchParams.get("op");
    const body = await req.json().catch(() => ({}));

    if (op === "create_request") {
      const { title, description, priority = "medium", due_at, author_name } = body;
      if (!title || typeof title !== "string" || title.length > 200) return json({ error: "Invalid title" }, 400);
      const desc = typeof description === "string" ? description.slice(0, 5000) : null;
      const pri = ["low", "medium", "high"].includes(priority) ? priority : "medium";

      const { data, error } = await admin.from("requests").insert({
        user_id: client.user_id, client_id: client.id,
        title: title.trim(), description: desc, priority: pri,
        due_at: due_at || null, status: "open",
      }).select().single();
      if (error) return json({ error: error.message }, 400);

      if (author_name) {
        await admin.from("request_comments").insert({
          request_id: data.id, client_id: client.id, user_id: client.user_id,
          author: "client", author_name: String(author_name).slice(0, 100),
          body: `Submitted by ${String(author_name).slice(0, 100)}`,
        });
      }
      return json({ request: data });
    }

    if (op === "add_comment") {
      const { request_id, body: commentBody, author_name } = body;
      if (!request_id || !commentBody) return json({ error: "Missing fields" }, 400);
      if (String(commentBody).length > 5000) return json({ error: "Comment too long" }, 400);
      const { data: r } = await admin.from("requests").select("id").eq("id", request_id).eq("client_id", client.id).maybeSingle();
      if (!r) return json({ error: "Request not found" }, 404);

      const { data, error } = await admin.from("request_comments").insert({
        request_id, client_id: client.id, user_id: client.user_id,
        author: "client", author_name: author_name ? String(author_name).slice(0, 100) : null,
        body: String(commentBody),
      }).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ comment: data });
    }

    if (op === "mark_read") {
      const { request_id } = body;
      if (!request_id) return json({ error: "Missing fields" }, 400);
      await admin.from("requests").update({ client_last_read_at: new Date().toISOString() }).eq("id", request_id).eq("client_id", client.id);
      return json({ ok: true });
    }

    if (op === "create_task") {
      const { request_id, title } = body;
      if (!request_id || !title || typeof title !== "string" || title.length > 200) return json({ error: "Invalid title" }, 400);
      const { data: r } = await admin.from("requests").select("id").eq("id", request_id).eq("client_id", client.id).maybeSingle();
      if (!r) return json({ error: "Request not found" }, 404);

      const { data, error } = await admin.from("request_tasks").insert({
        request_id, client_id: client.id, user_id: client.user_id, title: title.trim(),
      }).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ task: data });
    }

    if (op === "toggle_task") {
      const { task_id, is_done } = body;
      if (!task_id) return json({ error: "Missing fields" }, 400);
      const { data: t } = await admin.from("request_tasks").select("id").eq("id", task_id).eq("client_id", client.id).maybeSingle();
      if (!t) return json({ error: "Task not found" }, 404);

      const { data, error } = await admin.from("request_tasks").update({ is_done: !!is_done }).eq("id", task_id).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ task: data });
    }

    if (op === "sign_upload") {
      const { request_id, file_name, relative_path } = body;
      if (!request_id || !file_name) return json({ error: "Missing fields" }, 400);
      const { data: r } = await admin.from("requests").select("id").eq("id", request_id).eq("client_id", client.id).maybeSingle();
      if (!r) return json({ error: "Request not found" }, 404);
      const safe = String(file_name).replace(/[^\w.\-]+/g, "_");
      const path = `${client.user_id}/${client.id}/${request_id}/${Date.now()}-${safe}`;
      const { data, error } = await admin.storage.from("request-attachments").createSignedUploadUrl(path);
      if (error) return json({ error: error.message }, 400);
      return json({ ...data, storage_path: path, relative_path: relative_path ?? null });
    }

    if (op === "add_attachment") {
      const { request_id, file_name, storage_path, relative_path, mime_type, size_bytes } = body;
      if (!request_id || !file_name || !storage_path) return json({ error: "Missing fields" }, 400);
      const { data: r } = await admin.from("requests").select("id").eq("id", request_id).eq("client_id", client.id).maybeSingle();
      if (!r) return json({ error: "Request not found" }, 404);

      const { data, error } = await admin.from("request_attachments").insert({
        request_id, client_id: client.id, user_id: client.user_id, uploaded_by: "client",
        file_name: String(file_name).slice(0, 255),
        relative_path: relative_path ? String(relative_path).slice(0, 500) : null,
        storage_path, mime_type: mime_type ? String(mime_type).slice(0, 120) : null,
        size_bytes: size_bytes ?? null,
      }).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ attachment: data });
    }

    if (op === "sign_download") {
      const { attachment_id } = body;
      if (!attachment_id) return json({ error: "Missing fields" }, 400);
      const { data: att } = await admin.from("request_attachments").select("storage_path").eq("id", attachment_id).eq("client_id", client.id).maybeSingle();
      if (!att) return json({ error: "Not found" }, 404);
      const { data, error } = await admin.storage.from("request-attachments").createSignedUrl(att.storage_path, 60 * 10);
      if (error) return json({ error: error.message }, 400);
      return json({ url: data.signedUrl });
    }

    return json({ error: "Unknown op" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
