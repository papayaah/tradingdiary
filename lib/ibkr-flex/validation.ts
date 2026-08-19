const TOKEN_PATTERN = /^\d{16,64}$/;
const QUERY_ID_PATTERN = /^\d{4,20}$/;

export function normalizeFlexToken(value: unknown): string {
  const token = typeof value === 'string' ? value.replace(/\s+/g, '') : '';
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error('Enter the numeric Flex Web Service token from IBKR.');
  }
  return token;
}

export function normalizeFlexQueryId(value: unknown): string {
  const queryId = typeof value === 'string' ? value.trim() : '';
  if (!QUERY_ID_PATTERN.test(queryId)) {
    throw new Error('Enter the numeric Query ID from the blue information icon.');
  }
  return queryId;
}
