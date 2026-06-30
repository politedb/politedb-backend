export function normalizeHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (typeof value === 'string') {
        return [[key, value]];
      }

      if (Array.isArray(value)) {
        return [[key, value.join(',')]];
      }

      return [];
    }),
  );
}

export function parseJsonText<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value);
}

export function normalizeSql(sql?: string) {
  return sql?.trim().replace(/\s+\n/g, '\n') ?? '';
}
