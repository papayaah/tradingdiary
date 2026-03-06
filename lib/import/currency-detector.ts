export function detectCurrency(headers: string[], rows: any[]): string | undefined {
    const allText = (headers.join(' ') + ' ' + JSON.stringify(rows.slice(0, 10))).toLowerCase();

    if (allText.includes('hkd') || allText.includes('hong kong dollar')) return 'HKD';
    if (allText.includes('usd') || allText.includes('us dollar')) return 'USD';
    if (allText.includes('eur') || allText.includes('euro')) return 'EUR';
    if (allText.includes('gbp') || allText.includes('british pound')) return 'GBP';
    if (allText.includes('cad') || allText.includes('canadian dollar')) return 'CAD';
    if (allText.includes('aud') || allText.includes('australian dollar')) return 'AUD';
    if (allText.includes('sgd') || allText.includes('singapore dollar')) return 'SGD';
    if (allText.includes('jpy') || allText.includes('yen')) return 'JPY';

    // Check for currency symbols in some values
    const sampleValues = JSON.stringify(rows.slice(0, 5));
    if (sampleValues.includes('HK$')) return 'HKD';
    if (sampleValues.includes('£')) return 'GBP';
    if (sampleValues.includes('€')) return 'EUR';
    // Note: '$' is too generic, many currencies use it.

    return undefined;
}
