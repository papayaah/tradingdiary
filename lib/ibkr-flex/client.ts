const BASE_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';
const USER_AGENT = 'TradingDiary Flex Connector/1.0';
const DEFAULT_TIMEOUT_MS = 20_000;

function xmlValue(source: string, name: string): string {
  const match = source.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function actionRequiredCode(code: string): boolean {
  return ['1010', '1011', '1012', '1013', '1014', '1015', '1016', '1020'].includes(code);
}

export class IbkrFlexApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly actionRequired: boolean,
  ) {
    super(message);
    this.name = 'IbkrFlexApiError';
  }
}

export interface IbkrFlexClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

async function requestText(
  path: 'SendRequest' | 'GetStatement',
  token: string,
  query: string,
  options: IbkrFlexClientOptions,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const url = new URL(`${BASE_URL}/${path}`);
    url.searchParams.set('t', token);
    url.searchParams.set('q', query);
    url.searchParams.set('v', '3');
    // Activity Flex supports a server-side period override up to 365 days. This
    // ensures the first import gets the full launch history even if the saved
    // query's display period was configured differently.
    if (path === 'SendRequest') url.searchParams.set('p', '365');
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain, text/csv, application/xml' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new IbkrFlexApiError(`IBKR returned HTTP ${response.status}.`, String(response.status), false);
    return response.text();
  } catch (error) {
    if (error instanceof IbkrFlexApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new IbkrFlexApiError('IBKR did not respond before the request timed out.', 'timeout', false);
    }
    throw new IbkrFlexApiError('Could not reach the IBKR Flex Web Service.', 'network', false);
  } finally {
    clearTimeout(timer);
  }
}

function throwFlexFailure(source: string): never {
  const code = xmlValue(source, 'ErrorCode') || 'unknown';
  const remoteMessage = xmlValue(source, 'ErrorMessage');
  const message = actionRequiredCode(code)
    ? 'IBKR rejected the token or Query ID. Regenerate the token and verify the Query ID.'
    : remoteMessage || 'IBKR could not generate the Flex report.';
  throw new IbkrFlexApiError(message, code, actionRequiredCode(code));
}

export async function retrieveFlexStatement(
  token: string,
  queryId: string,
  options: IbkrFlexClientOptions = {},
): Promise<string> {
  const sendResponse = await requestText('SendRequest', token, queryId, options);
  if (xmlValue(sendResponse, 'Status').toLowerCase() !== 'success') throwFlexFailure(sendResponse);
  const referenceCode = xmlValue(sendResponse, 'ReferenceCode');
  if (!referenceCode) throw new IbkrFlexApiError('IBKR did not return a report reference code.', 'missing_reference', false);

  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const delays = [2_000, 2_000, 3_000, 5_000, 8_000];
  for (const delay of delays) {
    await sleep(delay);
    const statement = await requestText('GetStatement', token, referenceCode, options);
    const errorCode = xmlValue(statement, 'ErrorCode');
    if (errorCode === '1019') continue;
    if (xmlValue(statement, 'Status').toLowerCase() === 'fail' || errorCode) throwFlexFailure(statement);
    if (!statement.trim()) throw new IbkrFlexApiError('IBKR returned an empty Flex report.', 'empty_report', false);
    return statement;
  }
  throw new IbkrFlexApiError('IBKR is still generating the report. Try Sync now again shortly.', '1019', false);
}
