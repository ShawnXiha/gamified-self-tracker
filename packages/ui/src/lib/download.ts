import type { BackupPayload } from 'storage';

/**
 * Serializes a backup payload to a JSON Blob and triggers a browser download
 * named `gamified-backup-YYYY-MM-DD.json`. The date (UTC, from `now`) is
 * injectable so callers can pin it deterministically in tests.
 */
export function downloadBackup(payload: BackupPayload, now: Date = new Date()): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `gamified-backup-${now.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoke on the next tick: WebKit/Safari can abort a download when the
  // object URL is revoked before the fetch has actually started (file-saver.js
  // waits ~40ms; a 0ms timeout is sufficient in practice).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
