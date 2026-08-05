export const MAX_ALERT_HISTORY_ITEMS = 200;

/**
 * Alert collections are newest-first. Keep the newest entries and trim only
 * from the end; alert age does not affect retention.
 */
export const limitAlertHistory = <T>(
  alerts: T[],
  maximum: number = MAX_ALERT_HISTORY_ITEMS,
): T[] => alerts.slice(0, Math.max(0, Math.floor(maximum)));
