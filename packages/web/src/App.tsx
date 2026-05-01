import { Sidebar } from "@/components/Sidebar";
import { AppRoutes } from "./router";

export default function App() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <AppRoutes />
      </main>
    </div>
  );
}
