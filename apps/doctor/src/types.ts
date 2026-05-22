// cct-doctor probe / runner types.
// Source of truth: design/05-backend.md §7.

export type ProbeLevel = 'ok' | 'warn' | 'error';

export interface ProbeResult {
  name: string;
  level: ProbeLevel;
  message?: string;
  remediation?: string;
  details?: unknown;
}

export interface DoctorRunReport {
  generatedAt: string;
  platform: NodeJS.Platform;
  results: ProbeResult[];
  errorCount: number;
  warnCount: number;
  okCount: number;
}
