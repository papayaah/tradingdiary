// Admin allowlist check. Admins are configured via env (already passed through
// docker-compose): ADMIN_EMAILS (comma-separated) and/or ADMIN_EMAIL.

export function isAdminAllowlistConfigured(): boolean {
  const allow = [
    ...(process.env.ADMIN_EMAILS?.split(',') ?? []),
    process.env.ADMIN_EMAIL ?? '',
  ].filter((e) => e.trim().length > 0);
  return allow.length > 0;
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const allow = [
    ...(process.env.ADMIN_EMAILS?.split(',') ?? []),
    process.env.ADMIN_EMAIL ?? '',
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // If no admin allowlist is configured in env:
  // - In production, fail-closed (return false) for safety.
  // - In non-production (dev/test), grant access to any signed-in user for convenience.
  if (allow.length === 0) {
    return process.env.NODE_ENV !== 'production';
  }

  return allow.includes(email.toLowerCase());
}

