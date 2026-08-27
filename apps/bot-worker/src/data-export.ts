export interface PersonalDataExport {
  schemaVersion: 1;
  exportedAt: string;
  timezone: string;
  sections: Record<string, unknown[]>;
}

export function buildPersonalDataExport(
  exportedAt: string,
  timezone: string,
  sections: Record<string, unknown[]>,
): PersonalDataExport {
  return { schemaVersion: 1, exportedAt, timezone, sections };
}

export function serializePersonalDataExport(value: PersonalDataExport): { filename: string; content: string; byteLength: number } {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const byteLength = new TextEncoder().encode(content).byteLength;
  const date = value.exportedAt.slice(0, 10);
  return { filename: `ai-trainer-export-${date}.json`, content, byteLength };
}

export function formatExportSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
