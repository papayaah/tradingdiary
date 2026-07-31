const EXPLICIT_TIME_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Scanner timestamps are stored as PostgreSQL `timestamp without time zone`
 * values, with UTC enforced on every application database connection. Add the
 * missing UTC designator before values cross the HTTP boundary so browsers do
 * not reinterpret them in the viewer's local timezone.
 */
export function scannerTimestampToUtcIso(
  value: string | null | undefined,
): string | null | undefined {
  if (!value) return value;

  const isoCompatible = value.replace(' ', 'T');
  const timestamp = Date.parse(
    EXPLICIT_TIME_ZONE.test(isoCompatible)
      ? isoCompatible
      : `${isoCompatible}Z`,
  );

  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : value;
}
