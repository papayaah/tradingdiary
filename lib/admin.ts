// Admin allowlist check. Admins are configured via env (already passed through
// docker-compose): ADMIN_EMAILS (comma-separated) and/or ADMIN_EMAIL.

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const allow = [
    ...(process.env.ADMIN_EMAILS?.split(',') ?? []),
    process.env.ADMIN_EMAIL ?? '',
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}
