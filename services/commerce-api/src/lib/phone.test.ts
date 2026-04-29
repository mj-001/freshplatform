import { describe, it, expect } from 'vitest';
import { normalizeKenyanPhone } from './phone.js';
import { AppError } from './errors.js';

describe('normalizeKenyanPhone', () => {
  it.each([
    ['0712345678', '254712345678'],
    ['712345678', '254712345678'],
    ['254712345678', '254712345678'],
    ['+254712345678', '254712345678'],
    ['+254 712 345 678', '254712345678'],
    ['+254-712-345-678', '254712345678'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeKenyanPhone(input)).toBe(expected);
  });

  it.each(['', 'abc', '12345', '00712345678', '+1 555 123 4567'])(
    'rejects invalid input: %s',
    (input) => {
      expect(() => normalizeKenyanPhone(input)).toThrow(AppError);
    },
  );
});
