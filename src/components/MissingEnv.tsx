export const MissingEnv = () => (
  <div className="min-h-screen bg-background flex items-center justify-center p-6">
    <div className="max-w-lg w-full rounded-2xl border border-border bg-card p-8 shadow-lg space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Supabase not configured</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        The app needs a <code className="text-xs bg-secondary px-1 py-0.5 rounded">.env</code> file in the project root.
        Without it, the page stays blank because the database client cannot start.
      </p>
      <pre className="text-xs bg-secondary/60 rounded-lg p-4 overflow-x-auto text-foreground border border-border">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key`}
      </pre>
      <p className="text-sm text-muted-foreground">
        Get these from Supabase → Project Settings → API. Then restart the dev server:
      </p>
      <pre className="text-xs bg-secondary/60 rounded-lg p-3 text-foreground">npm run dev -- --host 127.0.0.1</pre>
    </div>
  </div>
);
