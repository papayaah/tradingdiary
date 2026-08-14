export function getCurrencySymbol(currency: string = 'USD'): string {
    const symbols: Record<string, string> = {
        'USD': '$',
        'HKD': 'HK$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥',
        'KRW': '₩',
        'CNY': '¥',
        'SGD': 'S$',
        'AUD': 'A$',
        'CAD': 'C$',
        'TWD': 'NT$',
        'INR': '₹',
        'CHF': 'CHF\u00a0',
        'PHP': '₱',
    };
    const code = currency.toUpperCase();
    return symbols[code] || `${code}\u00a0`;
}

export function formatCurrency(value: number, currency: string = 'USD'): string {
    const symbol = getCurrencySymbol(currency);
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    return `${sign}${symbol}${absValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}
