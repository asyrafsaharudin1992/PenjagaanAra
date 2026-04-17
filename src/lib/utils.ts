import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeBranch(branch?: string): string | undefined {
  // FIX: Removed the 'Kajang' default. Returning undefined when branch is
  // not set lets callers treat it as "no branch assigned" rather than
  // silently inheriting Kajang — which caused Admin SK (no branch in
  // Firestore) to see all Kajang data instead of Seri Kembangan data.
  if (!branch || !branch.trim()) return undefined;
  const b = branch.trim().toUpperCase();
  if (b === 'KJ' || b === 'KAJANG') return 'Kajang';
  if (b === 'SK' || b === 'SERI KEMBANGAN') return 'Seri Kembangan';
  return branch;
}