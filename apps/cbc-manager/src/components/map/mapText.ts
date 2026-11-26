import { isOuterCircleName } from '../../services/kmlParser.ts';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function areaDisplayName(code: string): string {
  return /^\d/.test(code) ? `Area ${code}` : code;
}

export function areaLabel(code: string | null): string {
  return code ? areaDisplayName(code) : '—';
}

export function isOuterCircleBoundary(code: string, label?: string | null): boolean {
  return isOuterCircleName(`${code} ${label ?? ''}`);
}
