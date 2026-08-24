export interface GovernorCadenceDisplay {
  cadenceSeconds: number;
  uniqueKeys: number;
  bindingTerm: string;
  predictedReqPerHour: number;
  floorSeconds: number;
  overrideSeconds: number | null;
}

/**
 * Overlay a saved manual override on the last scanner-published metrics.
 * The scanner normally republishes within seconds, but the control plane and
 * dashboard should not show the previous automatic cadence in the meantime.
 */
export function applyCadenceOverride<T extends GovernorCadenceDisplay>(
  item: T,
  overrideSeconds: number | null,
): T {
  if (overrideSeconds === null) {
    return { ...item, overrideSeconds };
  }

  const cadenceSeconds = Math.max(Math.round(overrideSeconds), item.floorSeconds);
  return {
    ...item,
    cadenceSeconds,
    bindingTerm: 'manual',
    predictedReqPerHour: cadenceSeconds > 0
      ? Math.round((item.uniqueKeys * 3600) / cadenceSeconds)
      : 0,
    overrideSeconds,
  };
}
