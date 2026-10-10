import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './ui/global.css';
import { getSettingsStore } from './store';
import { setTrackTheme } from './render';

// 最初の描画の前に配色を決める（ライトモードでちらつかないように）
const light = getSettingsStore().getState().light;
document.documentElement.dataset.theme = light ? 'light' : 'dark';
setTrackTheme(light ? 'light' : 'dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// 起動できたことを知らせる（artifact.html の起動チェック用）
(window as { __keibaBooted?: boolean }).__keibaBooted = true;
