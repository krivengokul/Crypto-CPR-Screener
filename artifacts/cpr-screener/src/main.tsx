import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Registers window.cprRepairChartLinks (one-time chart-link View key repair; see lib/chartLinkRepair.ts)
import "@/lib/chartLinkRepair";

createRoot(document.getElementById("root")!).render(<App />);
