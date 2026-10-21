import { useEffect, useState } from 'react';

import { invoke } from '@tauri-apps/api/core';
import { useT } from '@nordly-i18n';

import { SettingRow } from '../primitives/SettingRow';

interface CaptureStatus {
  listening: boolean;
  error: string | null;
}

export function CaptureSection(): JSX.Element {
  const t = useT();
  const [token, setToken] = useState('');
  const [folder, setFolder] = useState('');
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [nextToken, nextStatus, nextFolder] = await Promise.all([
          invoke<string>('capture_token'),
          invoke<CaptureStatus>('capture_status'),
          invoke<string>('capture_extension_dir').catch(() => ''),
        ]);
        if (cancelled) return;
        setToken(nextToken);
        setStatus(nextStatus);
        setFolder(nextFolder);
      } catch (err) {
        console.error('[nordly.settings.capture] load failed', err);
        if (!cancelled) setError(t('nordly.settings.browser.error'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const rotate = async (): Promise<void> => {
    setError(null);
    try {
      setToken(await invoke<string>('capture_token_rotate'));
      setCopied(false);
    } catch (err) {
      console.error('[nordly.settings.capture] rotate failed', err);
      setError(t('nordly.settings.browser.error'));
    }
  };

  const showFolder = async (): Promise<void> => {
    setError(null);
    try {
      setFolder(await invoke<string>('capture_reveal_extension'));
    } catch (err) {
      console.error('[nordly.settings.capture] reveal failed', err);
      setError(t('nordly.settings.browser.folder_missing'));
    }
  };

  const openChrome = async (): Promise<void> => {
    setError(null);
    try {
      await invoke('capture_open_chrome_extensions');
    } catch (err) {
      console.error('[nordly.settings.capture] chrome open failed', err);
      setError(t('nordly.settings.browser.error'));
    }
  };

  const copy = async (): Promise<void> => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
  };

  const portLabel = status?.error
    ? t('nordly.settings.browser.port_busy')
    : status?.listening
      ? t('nordly.settings.browser.listening')
      : t('nordly.settings.browser.starting');

  return (
    <>
      <SettingRow
        label={t('nordly.settings.browser.install_label')}
        hint={t('nordly.settings.browser.install_hint')}
        stacked
      >
        <div className="nordly-settings-capture">
          <input
            className="nordly-settings-text-input nordly-settings-text-input--wide"
            readOnly
            value={folder}
            placeholder={t('nordly.settings.browser.folder_missing')}
          />
          <div className="nordly-settings-google-actions">
            <button type="button" className="nordly-settings-vault-btn" onClick={() => void showFolder()}>
              {t('nordly.settings.browser.show_folder')}
            </button>
            <button type="button" className="nordly-settings-vault-btn" onClick={() => void openChrome()}>
              {t('nordly.settings.browser.open_chrome')}
            </button>
          </div>
        </div>
      </SettingRow>
      <SettingRow label={t('nordly.settings.browser.code_label')} hint={t('nordly.settings.browser.code_hint')} stacked>
        <div className="nordly-settings-capture">
          <input className="nordly-settings-text-input nordly-settings-text-input--wide" readOnly value={token} />
          <div className="nordly-settings-google-actions">
            <button type="button" className="nordly-settings-vault-btn" disabled={!token} onClick={() => void copy()}>
              {copied ? t('nordly.settings.browser.copied') : t('nordly.settings.browser.copy')}
            </button>
            <button type="button" className="nordly-settings-vault-btn" onClick={() => void rotate()}>
              {t('nordly.settings.browser.new_code')}
            </button>
          </div>
        </div>
      </SettingRow>
      <p className="nordly-settings-capture__status">{error ?? portLabel}</p>
    </>
  );
}
