/** Golongan yang ditandai warning (sensitif). */
const SENSITIVE_GOLONGAN = new Set([
  'prekursor',
  'psikotropika',
  'oot',
  'ssa',
]);

export function isSensitiveGolongan(nama) {
  if (!nama) return false;
  return SENSITIVE_GOLONGAN.has(String(nama).trim().toLowerCase());
}

export function golonganBadgeClass(nama) {
  if (isSensitiveGolongan(nama)) {
    return 'bg-state-warning text-bg-base';
  }
  return 'border border-border-subtle bg-bg-base text-text-secondary';
}
