import { Sidebar } from "@/components/Sidebar";
import { AppRoutes } from "./router";

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        <AppRoutes />
      </main>
    </div>
  );
}
