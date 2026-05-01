import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Browse from "./pages/Browse";
import Dashboard from "./pages/Dashboard";
import FileView from "./pages/FileView";
import Settings from "./pages/Settings";
import Timeline from "./pages/Timeline";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/p" replace />} />
      <Route path="/p" element={<Dashboard />} />
      <Route path="/p/:alias" element={<Dashboard />} />
      <Route path="/p/:alias/browse" element={<Browse />} />
      <Route path="/p/:alias/browse/:type" element={<Browse />} />
      <Route path="/p/:alias/browse/:type/:id" element={<FileView />} />
      <Route path="/p/:alias/timeline" element={<Timeline />} />
      <Route path="/p/:alias/settings" element={<Settings />} />
    </Routes>
  );
}

export function useAlias(): string | undefined {
  const { alias } = useParams<{ alias: string }>();
  return alias;
}
