import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { MissingEnv } from "./components/MissingEnv.tsx";
import "./index.css";

const supabaseConfigured =
  Boolean(import.meta.env.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

createRoot(document.getElementById("root")!).render(
  supabaseConfigured ? <App /> : <MissingEnv />,
);
