import { describe, expect, it } from 'vitest';
import { decryptFlexToken, encryptFlexToken } from './crypto';

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters';

describe('IBKR Flex token encryption', () => {
  it('round-trips without placing the token in the stored payload', () => {
    const token = '12345678901234567890';
    const encrypted = encryptFlexToken(token, SECRET);
    expect(encrypted).not.toContain(token);
    expect(decryptFlexToken(encrypted, SECRET)).toBe(token);
  });

  it('rejects a different encryption key', () => {
    const encrypted = encryptFlexToken('12345678901234567890', SECRET);
    expect(() => decryptFlexToken(encrypted, `${SECRET}-different`)).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptFlexToken('12345678901234567890', SECRET);
    expect(() => decryptFlexToken(`${encrypted.slice(0, -1)}x`, SECRET)).toThrow();
  });
});
