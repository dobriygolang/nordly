import { useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import { authTelegram, getAuthConfig } from '@features/auth/api/auth';
import { useSessionStore } from '@shared/model/session';

function TelegramIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false" className="login-tg-icon">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"
      />
    </svg>
  );
}

async function persistSession(session: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}): Promise<void> {
  useSessionStore.getState().hydrate(session);
  if (window.nordly) {
    await window.nordly.auth.persist(session);
  }
}

function formatLoginError(err: unknown, t: (key: string) => string): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    message === 'network_error' ||
    lower === 'load failed' ||
    lower.includes('failed to fetch') ||
    lower.includes('network')
  ) {
    return t('nordly.login.error_network');
  }
  return message || t('nordly.login.error_sign_in');
}

export function LoginScreen(): JSX.Element {
  const t = useT();
  const [code, setCode] = useState('');
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuthConfig()
      .then((cfg) => {
        const username = cfg.telegramBotUsername.trim();
        if (!username) {
          throw new Error('Telegram bot username missing in auth config');
        }
        setBotUsername(username);
      })
      .catch((err: unknown) => {
        setError(formatLoginError(err, t));
      })
      .finally(() => {
        setConfigLoading(false);
      });
  }, [t]);

  const botLink = botUsername ? `https://t.me/${botUsername}?start=login` : null;

  async function openBot(): Promise<void> {
    if (!botLink) return;
    const bridge = window.nordly;
    if (bridge) {
      await bridge.shell.openExternal(botLink);
    } else {
      window.open(botLink, '_blank', 'noopener,noreferrer');
    }
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = code.trim();

    if (!trimmed) {
      if (!botLink) {
        setError(t('nordly.login.bot_not_configured'));
        return;
      }
      setError(null);
      await openBot();
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const auth = await authTelegram(trimmed);
      await persistSession({
        userId: auth.userId,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        expiresAt: auth.expiresAt,
      });
    } catch (err) {
      setError(formatLoginError(err, t));
    } finally {
      setBusy(false);
    }
  }

  const hasCode = code.trim().length > 0;

  return (
    <div className="login-screen">
      <div className="login-stack">
        <h1 className="login-brand">NORDLY</h1>
        <span className="login-rule" aria-hidden />

        <form className="login-form" onSubmit={(e) => void onSubmit(e)}>
          <p className="login-hint">
            {botLink ? t('nordly.login.hint_with_link') : t('nordly.login.hint_no_link')}
          </p>

          <input
            id="tg-code"
            className="login-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t('nordly.login.code_placeholder')}
            autoComplete="one-time-code"
            maxLength={16}
            aria-label={t('nordly.login.code_aria')}
            disabled={busy || configLoading}
          />

          <button
            type="submit"
            className="login-tg-btn"
            disabled={busy || configLoading}
            aria-label={hasCode ? t('nordly.login.sign_in_aria') : t('nordly.login.open_bot_aria')}
          >
            <TelegramIcon />
          </button>

          {error && <p className="login-status login-status--error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
