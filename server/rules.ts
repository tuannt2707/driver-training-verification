export class InputError extends Error {
  status = 400;
}

export function isoDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  let s = value.trim();
  const dmy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
  if (dmy) s = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : '';
}

export const CERTIFICATE_DATE_FIELDS = ['dateOfBirth','cccdIssueDate','licenseIssueDate','decisionDate','issueDate','validUntil','trainingStartDate','trainingEndDate','examDate'] as const;

/** Normalize legacy calendar dates for admin APIs and native date inputs, without rewriting storage. */
export function normalizeCertificateDates<T extends object>(record:T):T {
  const normalized={...record} as Record<string,unknown>;
  for(const field of CERTIFICATE_DATE_FIELDS){
    const value=normalized[field];
    if(value===undefined)continue;
    if(value===null){normalized[field]='';continue;}
    const parsed=isoDate(value);
    // Keep invalid legacy values visible to validation; never silently discard them.
    if(parsed)normalized[field]=parsed;
  }
  return normalized as T;
}

export function todayVN(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

/** Five calendar years, clamping 29 February to the last day of February. */
export function defaultCertificateExpiry(issueDate: unknown): string {
  const normalized=isoDate(issueDate);
  if(!normalized)return '';
  const [year,month,day]=normalized.split('-').map(Number);
  const targetYear=year+5;
  if(targetYear>9999)return '';
  const result=new Date(`${String(targetYear).padStart(4,'0')}-${String(month).padStart(2,'0')}-01T00:00:00Z`);
  result.setUTCMonth(month,0);
  const lastDay=result.getUTCDate();
  result.setUTCDate(Math.min(day,lastDay));
  return result.toISOString().slice(0,10);
}

export function effectiveStatus(row: { status: string; validUntil?: string }, today = todayVN()): string {
  if (row.status === 'REVOKED' || row.status === 'PENDING') return row.status;
  const expiry = isoDate(row.validUntil);
  return row.status === 'EXPIRED' || (expiry && expiry < today) ? 'EXPIRED' : row.status;
}

export function validBirthDate(value: unknown): boolean {
  const s = isoDate(value);
  if (!s || s < '1900-01-01') return false;
  const latest = new Date(`${todayVN()}T00:00:00Z`);
  latest.setUTCFullYear(latest.getUTCFullYear() - 18);
  return s <= latest.toISOString().slice(0, 10);
}

export function validatePassword(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new InputError('Mật khẩu phải có từ 12 đến 128 ký tự.');
  }
}
