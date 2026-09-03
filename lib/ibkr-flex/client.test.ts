import { describe, expect, it, vi } from 'vitest';
import { IbkrFlexApiError, retrieveFlexStatement } from './client';

const success = '<FlexStatementResponse><Status>Success</Status><ReferenceCode>ref-123</ReferenceCode></FlexStatementResponse>';
const csv = 'ClientAccountID,Symbol,Buy/Sell,Quantity,TradePrice,TradeDate\nU1,AAPL,BUY,1,200,20260818';

describe('retrieveFlexStatement', () => {
  it('sends the query, polls the reference code, and returns the report', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(success))
      .mockResolvedValueOnce(new Response(csv));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(retrieveFlexStatement('12345678901234567890', '123456', { fetchImpl, sleep }))
      .resolves.toBe(csv);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/SendRequest?t=12345678901234567890&q=123456&v=3&p=365');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/GetStatement?t=12345678901234567890&q=ref-123&v=3');
  });

  it('uses a short period window for incremental syncs (clamped to 1–365)', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(success))
      .mockResolvedValueOnce(new Response(csv));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await retrieveFlexStatement('12345678901234567890', '123456', { fetchImpl, sleep, periodDays: 7 });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('&p=7');

    fetchImpl.mockClear().mockResolvedValueOnce(new Response(success)).mockResolvedValueOnce(new Response(csv));
    await retrieveFlexStatement('12345678901234567890', '123456', { fetchImpl, sleep, periodDays: 999 });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('&p=365'); // clamped
  });

  it('retries while IBKR is still generating error 1019', async () => {
    const generating = '<FlexStatementResponse><Status>Fail</Status><ErrorCode>1019</ErrorCode></FlexStatementResponse>';
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(success))
      .mockResolvedValueOnce(new Response(generating))
      .mockResolvedValueOnce(new Response(csv));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(retrieveFlexStatement('12345678901234567890', '123456', { fetchImpl, sleep }))
      .resolves.toBe(csv);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('marks rejected credentials as requiring user action', async () => {
    const rejected = '<FlexStatementResponse><Status>Fail</Status><ErrorCode>1015</ErrorCode><ErrorMessage>invalid</ErrorMessage></FlexStatementResponse>';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(rejected));

    try {
      await retrieveFlexStatement('12345678901234567890', '123456', { fetchImpl });
      throw new Error('Expected retrieveFlexStatement to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(IbkrFlexApiError);
      expect((error as IbkrFlexApiError).actionRequired).toBe(true);
      expect((error as IbkrFlexApiError).code).toBe('1015');
    }
  });
});
