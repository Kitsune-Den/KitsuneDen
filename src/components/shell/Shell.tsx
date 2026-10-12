"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ServerProvider } from "@/contexts/ServerContext";
import Sidebar, { useSidebarCollapsed } from "@/components/Sidebar";
import { ToastProvider } from "@/components/shell/Toaster";
import ShortcutsOverlay from "@/components/shell/ShortcutsOverlay";
import { applyTheme, watchSystemTheme } from "@/lib/theme";
import { useHotkeys } from "@/lib/useHotkeys";
import { confirmDiscard } from "@/lib/unsaved";

export default function Shell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [narrow, setNarrow] = useState(false);
  const router = useRouter();

  useEffect(() => {
    applyTheme();
    return watchSystemTheme();
  }, []);

  // Phones get the icon rail regardless of the saved preference
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const rail = collapsed || narrow;

  useHotkeys({
    h: () => {
      if (confirmDiscard()) router.push("/");
    },
  });

  return (
    <ServerProvider>
      <ToastProvider>
        <div
          className="grid min-h-screen transition-[grid-template-columns] duration-200"
          style={{ gridTemplateColumns: `${rail ? 64 : 236}px minmax(0, 1fr)` }}
        >
          <Sidebar collapsed={rail} onToggle={() => setCollapsed(!collapsed)} />
          <div className="min-w-0">{children}</div>
        </div>
        <ShortcutsOverlay />
      </ToastProvider>
    </ServerProvider>
  );
}
