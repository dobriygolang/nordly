import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import { flushSync } from '@shared/sync/SyncEngine';
import { isSyncEnabled } from '@shared/sync/syncConfig';
import {
  fetchVaultSalt,
  initVault,
  isVaultUnlocked,
  lockVault,
  subscribeVault,
  unlockVault,
} from '@shared/crypto/vault';
import { useSessionStore } from '@shared/model/session';

interface VaultUnlockGateProps {
  children: React.ReactNode;
}

type GateState =
  | { kind: 'loading' }
  | { kind: 'unlocked' }
  | { kind: 'needs-init' }
  | { kind: 'needs-unlock' }
  | { kind: 'failed'; message: string };

async function loadSavedPassphrase(userId: string): Promise<string | null> {
  const bridge = typeof window !== 'undefined' ? window.nordly?.vault : undefined;
  if (bridge) {
    return bridge.passLoad(userId);
  }
  return window.sessionStorage.getItem(`nordly:vault-pass:${userId}`);
}

async function savePassphrase(userId: string, pass: string): Promise<void> {
  const bridge = typeof window !== 'undefined' ? window.nordly?.vault : undefined;
  if (bridge) {
    await bridge.passSave(userId, pass);
    return;
  }
  window.sessionStorage.setItem(`nordly:vault-pass:${userId}`, pass);
}

async function clearSavedPassphrase(userId: string): Promise<void> {
  const bridge = typeof window !== 'undefined' ? window.nordly?.vault : undefined;
  if (bridge) {
    await bridge.passClear(userId);
    return;
  }
  window.sessionStorage.removeItem(`nordly:vault-pass:${userId}`);
}

export function VaultUnlockGate({ children }: VaultUnlockGateProps) {
  const t = useT();
  const userId = useSessionStore((s) => s.userId);
  const [state, setState] = useState<GateState>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);

  const probe = useCallback(
    async (cancelled: () => boolean) => {
      if (!userId) {
        if (!cancelled()) setState({ kind: 'failed', message: t('nordly.vault.err.no_session') });
        return;
      }
      if (isVaultUnlocked()) {
        if (!cancelled()) setState({ kind: 'unlocked' });
        return;
      }
      const salt = await fetchVaultSalt();
      if (cancelled()) return;
      if (salt === null) {
        setState({ kind: 'needs-init' });
        return;
      }
      const saved = await loadSavedPassphrase(userId);
      if (cancelled()) return;
      if (saved) {
        try {
          await unlockVault(saved);
          if (!cancelled()) setState({ kind: 'unlocked' });
          return;
        } catch {
          await clearSavedPassphrase(userId);
        }
      }
      if (!cancelled()) setState({ kind: 'needs-unlock' });
    },
    [t, userId],
  );

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      void probe(() => cancelled).catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : t('nordly.vault.err.unreachable');
        setError(msg);
        setState({ kind: 'failed', message: msg });
      });
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 4_000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const timer = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [probe, t]);

  useEffect(() => {
    const unsub = subscribeVault((u) => {
      setState(u ? { kind: 'unlocked' } : { kind: 'needs-unlock' });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (useSessionStore.getState().status === 'guest') lockVault();
  }, []);

  const handleSetup = async () => {
    if (!userId) return;
    setError(null);
    if (pwd1.length < 8) {
      setError(t('nordly.vault.err.short_passphrase'));
      return;
    }
    if (pwd1 !== pwd2) {
      setError(t('nordly.vault.err.mismatch'));
      return;
    }
    setBusy(true);
    try {
      await initVault();
      await unlockVault(pwd1);
      await savePassphrase(userId, pwd1);
      if (isSyncEnabled()) void flushSync();
      setState({ kind: 'unlocked' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    if (!userId) return;
    setError(null);
    if (!pwd1) {
      setError(t('nordly.vault.err.empty'));
      return;
    }
    setBusy(true);
    try {
      await unlockVault(pwd1);
      await savePassphrase(userId, pwd1);
      if (isSyncEnabled()) void flushSync();
      setState({ kind: 'unlocked' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t('nordly.vault.err.wrong_or_corrupt', { msg }));
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      out += alphabet[bytes[i]! % alphabet.length];
      if (i % 4 === 3 && i < bytes.length - 1) out += '-';
    }
    setPwd1(out);
    setPwd2(out);
  };

  if (state.kind === 'loading') {
    return <>{children}</>;
  }
  if (state.kind === 'unlocked') {
    return <>{children}</>;
  }
  if (state.kind === 'failed') {
    return (
      <GateShell>
        <Eyebrow text={t('nordly.vault.eyebrow.offline')} danger />
        <Headline text={t('nordly.vault.offline.headline')} />
        <Body text={t('nordly.vault.offline.body')} />
        <MonoHint text={state.message} />
        <PrimaryButton
          label={t('nordly.vault.cta.retry')}
          onClick={() => {
            setError(null);
            setState({ kind: 'loading' });
            void probe(() => false).catch((e) => {
              const m = e instanceof Error ? e.message : t('nordly.vault.err.still_unreachable');
              setState({ kind: 'failed', message: m });
            });
          }}
        />
      </GateShell>
    );
  }

  return (
    <GateShell>
      <Eyebrow
        text={
          state.kind === 'needs-init'
            ? t('nordly.vault.eyebrow.first_setup')
            : t('nordly.vault.eyebrow.locked')
        }
      />
      <Headline
        text={
          state.kind === 'needs-init'
            ? t('nordly.vault.setup.headline')
            : t('nordly.vault.unlock.headline')
        }
      />
      <Body
        text={
          state.kind === 'needs-init'
            ? `${t('nordly.vault.setup.body_pre')}${t('nordly.vault.setup.body_strong')}`
            : t('nordly.vault.unlock.body')
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (state.kind === 'needs-init') void handleSetup();
          else void handleUnlock();
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          width: '100%',
          maxWidth: 360,
          marginTop: 6,
        }}
      >
        <PassInput
          value={pwd1}
          onChange={setPwd1}
          placeholder={t('nordly.vault.input.passphrase')}
          disabled={busy}
          autoFocus
        />
        {state.kind === 'needs-init' && (
          <>
            <PassInput
              value={pwd2}
              onChange={setPwd2}
              placeholder={t('nordly.vault.input.confirm')}
              disabled={busy}
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy}
              className="mono nordly-vault-gen-btn"
            >
              {t('nordly.vault.generate')}
            </button>
            {pwd1.length > 0 && pwd1 === pwd2 && (
              <MonoHint text={pwd1} warn={t('nordly.vault.generate.warning')} />
            )}
          </>
        )}
        {error && <MonoHint text={error} danger />}
        <PrimaryButton
          type="submit"
          disabled={busy}
          label={
            busy
              ? t('nordly.vault.cta.working')
              : state.kind === 'needs-init'
                ? t('nordly.vault.cta.create')
                : t('nordly.vault.cta.unlock')
          }
        />
      </form>
      <Eyebrow text={t('nordly.vault.eyebrow.footer')} subtle />
    </GateShell>
  );
}

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fadein nordly-vault-gate" style={{ animationDuration: 'var(--motion-dur-small)' }}>
      {children}
    </div>
  );
}

function Eyebrow({ text, danger, subtle }: { text: string; danger?: boolean; subtle?: boolean }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: subtle ? 9 : 10,
        letterSpacing: '0.08em',
        color: danger ? 'var(--red)' : 'var(--ink-40)',
        textTransform: 'uppercase',
      }}
    >
      {text}
    </div>
  );
}

function Headline({ text }: { text: string }) {
  return (
    <h1
      style={{
        margin: 0,
        fontSize: 28,
        fontWeight: 500,
        letterSpacing: '-0.02em',
        color: 'var(--ink)',
        textAlign: 'center',
      }}
    >
      {text}
    </h1>
  );
}

function Body({ text }: { text: string }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 13.5,
        color: 'var(--ink-60)',
        maxWidth: 440,
        textAlign: 'center',
        lineHeight: 1.6,
      }}
    >
      {text}
    </p>
  );
}

function MonoHint({ text, warn, danger }: { text: string; warn?: string; danger?: boolean }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: danger ? 11 : 10,
        letterSpacing: '0.08em',
        color: danger ? 'var(--red)' : 'var(--ink-40)',
        textAlign: 'center',
        wordBreak: 'break-all',
      }}
    >
      {text}
      {warn && (
        <div style={{ marginTop: 4, color: 'var(--red)', fontSize: 9 }}>{warn}</div>
      )}
    </div>
  );
}

function PassInput({
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="password"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="nordly-vault-pass-input"
    />
  );
}

function PrimaryButton({
  label,
  onClick,
  type = 'button',
  disabled,
}: {
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '11px 20px',
        borderRadius: 999,
        background: disabled ? 'rgb(var(--ink-rgb) / 0.1)' : '#fff',
        color: disabled ? 'rgb(var(--ink-rgb) / 0.4)' : '#000',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 13.5,
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}
