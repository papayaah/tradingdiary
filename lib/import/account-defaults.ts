export interface ImportAccountDefaults {
  name: string;
  type: string;
  wasBrokerDetected: boolean;
}

export function getImportAccountDefaults(detectedBrokerName?: string | null): ImportAccountDefaults {
  const brokerName = detectedBrokerName?.trim();
  if (!brokerName) {
    return {
      name: 'Main Trading Account',
      type: 'Custom',
      wasBrokerDetected: false,
    };
  }

  return {
    name: `${brokerName} Account`,
    type: brokerName,
    wasBrokerDetected: true,
  };
}
