import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { TrackingProvider } from "@/contexts/TrackingContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TimeTracker from "./pages/TimeTracker";
import Invoicing from "./pages/Invoicing";
import Clients from "./pages/Clients";
import NewRequest from "./pages/NewRequest";
import DailyReport from "./pages/DailyReport";
import Settings from "./pages/Settings";
import ResetPassword from "./pages/ResetPassword";
import ClientPortal from "./pages/ClientPortal";
import TaskAssignment from "./pages/TaskAssignment";
import TrackerPortal from "./pages/TrackerPortal";
import NotFound from "./pages/NotFound";

import { useEffect } from "react";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Check if user prefers dark mode or has set it before
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) {
      document.documentElement.classList.add("dark");
    }

    // Listen for changes
    const listener = (e: MediaQueryListEvent) => {
      if (e.matches) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", listener);
    return () => window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", listener);
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TrackingProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/portal/:token" element={<ClientPortal />} />
              <Route path="/tracker-portal/:token" element={<TrackerPortal />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/time-tracker" element={<ProtectedRoute><TimeTracker /></ProtectedRoute>} />
              <Route path="/invoicing" element={<ProtectedRoute><Invoicing /></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
              <Route path="/requests" element={<ProtectedRoute><NewRequest /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><DailyReport /></ProtectedRoute>} />
              <Route path="/task-assignment" element={<ProtectedRoute><TaskAssignment /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TrackingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
