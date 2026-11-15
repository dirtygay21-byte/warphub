import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './global.css';
import App from './App.tsx';
import { installHorizontalWheel } from './utils/desktopWheel';
import { useRegistrationStageStore } from './stores/useRegistrationStageStore';

installHorizontalWheel();

// демо-сборка: снимки экранов открывают шаги записи (tools/ui-shots/audit.mjs, итог записи)
if (import.meta.env.MODE === 'demo') (window as unknown as { __warphubStages: typeof useRegistrationStageStore }).__warphubStages = useRegistrationStageStore;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
