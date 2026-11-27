import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CrashBoundary } from '@birdspotter/birding-core/CrashBoundary.tsx';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashBoundary appName="CBC Circle Manager">
      <App />
    </CrashBoundary>
  </StrictMode>
);
