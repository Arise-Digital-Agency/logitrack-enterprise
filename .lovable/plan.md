# Go-Live Fix Plan — LogiTrack HQ

Goal: ship a stable, end-to-end working app tomorrow. This pass closes the gaps found in the system walkthrough.

## 1. Auth hardening (DB migration + auth config)

- Add the missing trigger so every new signup gets a profile row:
  ```sql
  create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
  ```
- Backfill profiles for any existing users that don't have one.
- Disable email confirmation in auth config so users can sign in immediately after signup (matches the current Login flow). If email confirmation is desired instead, switch the Login UI to a "check your email" state — pick one.
- Enable HIBP leaked-password protection.

## 2. Password reset flow

- Add a "Forgot password?" link on `/login` that opens an inline form calling `resetPasswordForEmail` with `redirectTo: ${origin}/reset-password`.
- Create a public `/reset-password` page that detects the recovery hash and calls `supabase.auth.updateUser({ password })`.

## 3. Profile + hourly rate

- Add `hourly_rate numeric default 0` to `clients` (per-client default rate).
- In Time Tracker: when finishing a session, copy the selected client's `hourly_rate` into `time_logs.hourly_rate` so Daily Report earnings are non-zero.
- Add a "Default hourly rate" field to the Clients form.

## 4. Dashboard fixes

- Wire the "Start Timer" CTA to navigate to `/time-tracker`.
- Rename "Active Clients" → "Total Clients" (or add a filter).
- Remove the broken `tick` dependency in the data-loading `useEffect` and replace with a 30s refresh interval.

## 5. Time Tracker resilience

- Persist `{running, startedAt, elapsed, description, clientId}` to `localStorage` on every state change; rehydrate on mount so refresh / accidental nav doesn't lose a running session.
- Fix Pause: it currently only stops the interval but `setRunning(false)` resets the Start path; ensure Pause keeps `elapsed` and `startedAt` so Resume continues correctly (already partially works — just verify and persist).

## 6. Invoicing — derived overdue

- On read, mark invoices whose `status === 'pending'` and `due_at < today` as visually "overdue" (badge + KPI). Optional: an "Auto-mark overdue" button that bulk-updates rows.

## 7. UI cleanup

- Remove (or hide) the non-functional global header search until we wire it in v1.1.
- Consolidate toast usage: use `sonner` everywhere (`Clients`, `NewRequest`, `Settings` currently use the shadcn toast).
- Add a small "Desktop only" tooltip on the Capture widget when `getDisplayMedia` is unavailable (iOS Safari).

## 8. Security pass

- Run `supabase--linter` and `security--run_security_scan`; address any errors.
- Confirm RLS on `clients`, `invoices`, `requests`, `time_logs`, `profiles` is intact (it is, per schema).

## Out of scope for tomorrow

- Real-time updates across tabs.
- Google sign-in (can add post-launch).
- Uploading screenshots/recordings to storage (currently downloads locally — that's fine).
- Wiring the global search.

## Technical notes

- Migration file will contain: trigger creation, profile backfill, `clients.hourly_rate` column.
- Auth config changes go through `cloud--configure_auth` (disable email confirmation, enable HIBP).
- All code changes stay within existing pages; no new architecture.

After approval I'll implement all of the above in one pass and report back with a quick smoke-test checklist before you publish.
