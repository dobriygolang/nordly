import { createRoot } from 'react-dom/client';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { installNativeBridge } from '@platform/native-bridge';
import { isTauriRuntime } from '@platform/runtime';
import { applyTextScale, readTextScale } from '@shared/model/accessibility';
import { readStoredTheme } from '@shared/model/theme';
import { applyTheme } from '@shared/lib/applyTheme';
import './styles/globals.css';

installNativeBridge();
applyTextScale(readTextScale());
applyTheme(readStoredTheme());

type NordlyView = 'main' | 'tray' | 'notification';

function resolveView(): NordlyView {
  if (typeof window === 'undefined') return 'main';
  try {
    if (isTauriRuntime()) {
      const label = getCurrentWebviewWindow().label;
      if (label === 'tray-popover') return 'tray';
      if (label === 'notification') return 'notification';
    }
  } catch {
    /* ignore */
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view === 'tray') return 'tray';
    if (view === 'notification') return 'notification';
  } catch {
    /* ignore */
  }
  return 'main';
}

const view = resolveView();
if (view !== 'main' && typeof document !== 'undefined') {
  document.documentElement.dataset.nordlyView = view;
}

async function mountView(): Promise<void> {
  let RootApp: () => JSX.Element;
  let section: string;

  switch (view) {
    case 'tray': {
      const m = await import('@widgets/TrayPopover');
      RootApp = m.TrayPopoverApp;
      section = 'Nordly Tray';
      break;
    }
    case 'notification': {
      const m = await import('@widgets/NotificationOverlay');
      RootApp = m.NotificationOverlayApp;
      section = 'Nordly Notification';
      break;
    }
    default: {
      const [{ installSyncRegistry }, appModule] = await Promise.all([
        import('@app/syncRegistry'),
        import('@app/App'),
      ]);
      installSyncRegistry();
      RootApp = appModule.default;
      section = 'Nordly';
      break;
    }
  }

  const mount = document.getElementById('root');
  if (!mount) throw new Error('nordly: #root missing');

  createRoot(mount).render(
    <ErrorBoundary section={section}>
      <RootApp />
    </ErrorBoundary>,
  );
}

void mountView();
