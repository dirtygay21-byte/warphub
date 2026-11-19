import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './global.css';
import App from './App.tsx';
import { installHorizontalWheel } from './utils/desktopWheel';
import { useRegistrationStageStore } from './stores/useRegistrationStageStore';
import { useReservationStore } from './stores/useReservationStore';

installHorizontalWheel();

// демо-сборка: снимки экранов открывают шаги записи (tools/ui-shots/audit.mjs, итог записи)
if (import.meta.env.MODE === 'demo') {
  const w = window as unknown as { __warphubStages: typeof useRegistrationStageStore; __warphubReservation: typeof useReservationStore };
  w.__warphubStages = useRegistrationStageStore;
  // промо-снимки (20.11.2026): итог записи с временем — tools/ui-shots/promo.mjs
  w.__warphubReservation = useReservationStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
