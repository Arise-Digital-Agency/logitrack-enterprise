import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Timer, Receipt, Users, FilePlus, BarChart3, Settings as SettingsIcon, LifeBuoy, LogOut, Truck, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/time-tracker", label: "Time Tracker", icon: Timer },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/requests", label: "New Request", icon: FilePlus },
  { to: "/task-assignment", label: "Task Assignment", icon: ClipboardList },
  { to: "/reports", label: "Daily Report", icon: BarChart3 },
  { to: "/invoicing", label: "Invoicing", icon: Receipt },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export const AppSidebar = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [profile, setProfile] = useState<{ full_name: string | null; role: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand">
          <Truck className="h-5 w-5 text-brand-foreground" />
        </div>
        <div>
          <div className="font-semibold text-white text-base leading-tight">LogiTrack HQ</div>
          <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Enterprise Portal</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-white border-l-2 border-brand pl-[10px]"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        <div className="px-3 py-2 text-xs">
          <div className="text-white font-medium truncate">{profile?.full_name ?? user?.email}</div>
          <div className="text-sidebar-foreground/60 truncate">{profile?.role ?? "Logistics Manager"}</div>
        </div>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white transition-colors">
          <LifeBuoy className="h-4 w-4" /> Support
        </button>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </aside>
  );
};
