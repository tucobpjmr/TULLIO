
import { ViewportProvider } from "./components/Viewport.jsx";
import { VoyageDeskInner } from "./VoyageDeskInner.jsx";

// ─── ROOT APP ──────────────────────────────────────────────────────────────
// Thin wrapper: fornisce ViewportProvider (letto da useViewport() dentro
// VoyageDeskInner.jsx e nei suoi discendenti). Il resto dell'orchestratore è
// stato estratto in VoyageDeskInner.jsx (B-3 dell'audit del 13 agosto: un
// file, un componente — vedi docs/CLAUDE.md).
export default function VoyageDesk({ initialTeam, initialCurrentUserId } = {}) {
  return (
    <ViewportProvider>
      <VoyageDeskInner
        initialTeam={initialTeam}
        initialCurrentUserId={initialCurrentUserId}
      />
    </ViewportProvider>
  );
}
