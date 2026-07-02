import { createRoot } from 'react-dom/client';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

// React namespace is auto-injected via tsconfig "jsx": "react-jsx", so we
// deliberately do NOT `import React` here (an unused import in strict
// mode breaks the build).
import App from '@app/App';
import { installSyncRegistry } from '@app/syncRegistry';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { installNativeBridge } from '@platform/native-bridge';
import { isTauriRuntime } from '@platform/runtime';
import { applyTextScale, readTextScale } from '@shared/model/accessibility';
import { readStoredTheme } from '@shared/model/theme';
import { applyTheme } from '@shared/lib/applyTheme';
import { NotificationOverlayApp } from '@widgets/NotificationOverlay';
import { TrayPopoverApp } from '@widgets/TrayPopover';
import './styles/globals.css';

installNativeBridge();
installSyncRegistry();
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

const ROOT_META: Record<NordlyView, { component: () => JSX.Element; section: string }> = {
  main: { component: App, section: 'Nordly' },
  tray: { component: TrayPopoverApp, section: 'Nordly Tray' },
  notification: { component: NotificationOverlayApp, section: 'Nordly Notification' },
};

const { component: RootApp, section } = ROOT_META[view];

const mount = document.getElementById('root');
if (!mount) throw new Error('nordly: #root missing');

createRoot(mount).render(
  <ErrorBoundary section={section}>
    <RootApp />
  </ErrorBoundary>,
);
