import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Registers window.cprRepairChartLinks (one-time chart-link View key repair; see lib/chartLinkRepair.ts)
import "@/lib/chartLinkRepair";
// Registers window.cprLegendLinksFor (read-only: which chart links Legend Card 2 would show for a View)
import "@/lib/legendLinkDebug";
// Registers window.cprSyncLocalChartLinks and window.cprAttachChartLinksToView (dry-run by default; see lib/chartLinkMaintenance.ts)
import "@/lib/chartLinkMaintenance";

createRoot(document.getElementById("root")!).render(<App />);
