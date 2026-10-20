export type PassphraseStrength = 'short' | 'weak' | 'ok';

/** New vault passphrases need length and mixed characters. Existing passphrases are not re-scored. */
export function passphraseStrength(password: string): PassphraseStrength {
  if (password.length < 8) return 'short';
  const mixed = /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
  if (password.length < 12 || !mixed) return 'weak';
  return 'ok';
}
