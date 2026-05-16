import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

const Settings = () => {
  const { user, signOut } = useAuth();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name ?? "");
        setRole(data?.role ?? "Logistics Manager");
      });
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, full_name: fullName, role });
    setLoading(false);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Saved", description: "Your profile has been updated." });
  };

  return (
    <AppLayout searchPlaceholder="Search settings...">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account and workspace preferences.</p>
        </div>

        <form onSubmit={save} className="bg-card rounded-lg border border-border p-6 shadow-[var(--shadow-card)] space-y-5">
          <div>
            <h2 className="text-lg font-bold">Profile</h2>
            <p className="text-sm text-muted-foreground">Information shown across LogiTrack HQ.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</label>
              <input value={user?.email ?? ""} disabled className="h-11 w-full px-3 rounded-md border border-input bg-secondary text-sm text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Role</label>
              <input value={role} onChange={(e) => setRole(e.target.value)} className="h-11 w-full px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <button type="button" onClick={signOut} className="text-sm font-medium text-destructive hover:underline">Sign out</button>
            <button disabled={loading} className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-brand hover:bg-brand/90 text-brand-foreground text-sm font-semibold disabled:opacity-50">
              <Save className="h-4 w-4" /> Save changes
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
};

export default Settings;
