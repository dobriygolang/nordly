import { createRoot } from 'react-dom/client';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

// React namespace is auto-injected via tsconfig "jsx": "react-jsx", so we
// deliberately do NOT `import React` here (an unused import in strict
// mode breaks the build).
import App from '@app/App';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { installNativeBridge } from '@platform/native-bridge';
import { applyTextScale, readTextScale } from '@shared/model/accessibility';
import { readStoredTheme } from '@shared/model/prefs';
import { applyTheme } from '@shared/lib/applyTheme';
import { TrayPopoverApp } from '@widgets/TrayPopover';
import './styles/globals.css';

installNativeBridge();
applyTextScale(readTextScale());
applyTheme(readStoredTheme());

function resolveView(): 'main' | 'tray' {
  if (typeof window === 'undefined') return 'main';
  try {
    if ('__TAURI_INTERNALS__' in window && getCurrentWebviewWindow().label === 'tray-popover') {
      return 'tray';
    }
  } catch {
    /* ignore */
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'tray') return 'tray';
  } catch {
    /* ignore */
  }
  return 'main';
}

const view = resolveView();
if (view === 'tray' && typeof document !== 'undefined') {
  document.documentElement.dataset.nordlyView = 'tray';
}
const RootApp = view === 'tray' ? TrayPopoverApp : App;

const mount = document.getElementById('root');
if (!mount) throw new Error('nordly: #root missing');

createRoot(mount).render(
  <ErrorBoundary section={view === 'tray' ? 'Nordly Tray' : 'Nordly'}>
    <RootApp />
  </ErrorBoundary>,
);
