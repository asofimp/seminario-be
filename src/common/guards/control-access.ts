import type { ConfigService } from '@nestjs/config';

export type ControlAccess =
  { role: 'admin' } | { role: 'presenter'; phase: number };

// Qué permite una clave: admin (todo) o presentador de una fase (solo controlar).
export function resolveControlKey(
  config: ConfigService,
  key: string | undefined,
): ControlAccess | null {
  if (!key) return null;
  if (key === config.get<string>('adminApiKey')) return { role: 'admin' };
  const phase = config.get<Record<string, number>>('presenterKeys')?.[key];
  return phase ? { role: 'presenter', phase } : null;
}
