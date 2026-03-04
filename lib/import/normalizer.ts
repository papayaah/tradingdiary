/**
 * Normalizes various date formats to YYYYMMDD for use in the app.
 * Expected formats:
 * - "YYYY-MM-DD" -> "YYYYMMDD"
 * - "MM-DD / HH:mm" -> "YYYYMMDD" (assumes current year)
 * - "YYYY/MM/DD" -> "YYYYMMDD"
 * - "MM/DD/YYYY" -> "YYYYMMDD"
 */
export function normalizeDate(dateStr: string): string {
    if (!dateStr) return '';

    // Clean up common noise
    let clean = dateStr.trim().split(' ')[0].replace(/\//g, '-');

    // Handle MM-DD or MM-DD-YYYY
    const parts = clean.split('-');
    const now = new Date();
    const currentYear = now.getFullYear();

    if (parts.length === 2) {
        // MM-DD
        const m = parts[0].padStart(2, '0');
        const d = parts[1].padStart(2, '0');
        return `${currentYear}${m}${d}`;
    }

    if (parts.length === 3) {
        if (parts[0].length === 4) {
            // YYYY-MM-DD
            return parts[0] + parts[1].padStart(2, '0') + parts[2].padStart(2, '0');
        } else {
            // MM-DD-YYYY or DD-MM-YYYY (assuming US MM-DD-YYYY for now)
            const y = parts[2];
            const m = parts[0].padStart(2, '0');
            const d = parts[1].padStart(2, '0');
            return `${y}${m}${d}`;
        }
    }

    // Fallback: strip non-digits and hope for the best
    const digits = dateStr.replace(/\D/g, '');
    if (digits.length === 8) return digits; // YYYYMMDD
    if (digits.length === 4) return `${currentYear}${digits}`; // MMDD

    return dateStr; // Can't parse, return as is
}

/**
 * Normalizes various time formats to HH:mm:ss.
 */
export function normalizeTime(timeStr: string): string {
    if (!timeStr) return '00:00:00';

    // Clean up common noise like "06-10 / 16:07"
    let clean = timeStr.trim();
    if (clean.includes('/')) {
        clean = clean.split('/').pop()?.trim() || clean;
    }

    // Split by :
    const parts = clean.split(':');
    if (parts.length === 1) {
        // Maybe just "HHmm"?
        const digits = clean.replace(/\D/g, '');
        if (digits.length === 4) return `${digits.substring(0, 2)}:${digits.substring(2, 4)}:00`;
        return '00:00:00';
    }

    const h = parts[0].padStart(2, '0');
    const m = (parts[1] || '00').padStart(2, '0');
    const s = (parts[2] || '00').padStart(2, '0');

    return `${h}:${m}:${s}`;
}
