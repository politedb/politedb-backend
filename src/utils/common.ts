export function normalizeHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (typeof value === "string") {
        return [[key, value]];
      }

      if (Array.isArray(value)) {
        return [[key, value.join(",")]];
      }

      return [];
    }),
  );
}
