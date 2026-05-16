import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Mail, Lock, ShieldCheck, Cloud, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email("Enter a valid work email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

const Login = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created — welcome to LogiTrack");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      }
      navigate("/");
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-secondary via-background to-secondary px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand/80 shadow-lg shadow-brand/20">
          <Truck className="h-6 w-6 text-brand-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">LogiTrack HQ</h1>
          <p className="text-sm text-muted-foreground">Enterprise Service Management Portal</p>
        </div>
      </div>

      <div className="w-full max-w-md bg-card rounded-2xl shadow-[var(--shadow-elevated)] border border-border p-8">
        <h2 className="text-2xl font-bold text-foreground">{mode === "signin" ? "Welcome back" : "Create account"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "signin" ? "Enter your credentials to access your dashboard" : "Sign up to start tracking time and billing"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full h-12 px-4 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full h-12 pl-10 pr-4 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!email) { toast.error("Enter your email first"); return; }
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                    if (error) toast.error(error.message);
                    else toast.success("Password reset email sent");
                  }}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 pl-10 pr-4 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-lg bg-brand hover:bg-brand/90 text-brand-foreground font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {loading ? "Please wait..." : mode === "signin" ? "Sign In to Portal" : "Create Account"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "Don't have an enterprise account?" : "Already have an account?"}
          </p>
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-3 inline-flex items-center justify-center px-5 h-9 rounded-full border border-border text-xs font-bold uppercase tracking-wider hover:bg-secondary"
          >
            {mode === "signin" ? "Request Access" : "Sign In Instead"}
          </button>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4 text-muted-foreground/60">
        <Shield className="h-4 w-4" />
        <ShieldCheck className="h-4 w-4" />
        <Cloud className="h-4 w-4" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground/70">© 2026 LogiTrack HQ. Secure Enterprise Portal.</p>
    </div>
  );
};

export default Login;
