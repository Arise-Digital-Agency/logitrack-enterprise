import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash and auto-creates a session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Fallback: if there's already a session (deep link processed), enable form.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-secondary via-background to-secondary px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand/80 shadow-lg shadow-brand/20">
          <Truck className="h-6 w-6 text-brand-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Reset password</h1>
          <p className="text-sm text-muted-foreground">Choose a new password for your account</p>
        </div>
      </div>

      <form onSubmit={submit} className="w-full max-w-md bg-card rounded-2xl shadow-[var(--shadow-elevated)] border border-border p-8 space-y-4">
        {!ready && (
          <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
        )}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-12 pl-10 pr-4 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confirm password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full h-12 pl-10 pr-4 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
        <button type="submit" disabled={loading || !ready} className="w-full h-12 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground font-semibold text-sm transition-colors disabled:opacity-60">
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
};

export default ResetPassword;
