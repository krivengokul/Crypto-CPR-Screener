import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Screener from "@/pages/Screener";
import PatternSidebar, { patterns } from "@/components/ui/PatternSidebar";

const queryClient = new QueryClient();

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center h-full min-h-screen">
      <div className="text-center">
        <div className="text-lg font-semibold text-foreground mb-2">{label}</div>
        <div className="text-muted-foreground text-sm">Pattern coming soon</div>
      </div>
    </div>
  );
}

function App() {
  const [activePattern, setActivePattern] = useState("rising");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const activeLabel =
    patterns.find((p) => p.id === activePattern)?.label ?? activePattern;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex min-h-screen bg-background">
          <PatternSidebar
            activePattern={activePattern}
            onSelect={setActivePattern}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((v) => !v)}
          />
          <main className="flex-1 overflow-auto">
            {activePattern === "rising" ? (
              <Screener />
            ) : (
              <ComingSoon label={activeLabel} />
            )}
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
