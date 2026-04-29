import { AppError, ErrorCodes } from './errors.js';

/**
 * Normalize a Kenyan phone number to Daraja format: 254XXXXXXXXX (12 digits, no +).
 *
 * Accepts any of:
 *   "+254 712 345 678"
 *   "+254712345678"
 *   "254712345678"
 *   "0712345678"
 *   "712345678"
 *
 * Throws VALIDATION_FAILED on anything else.
 */
export function normalizeKenyanPhone(input: string): string {
  const digits = input.replace(/\D/g, '');

  if (digits.length === 9 && digits.startsWith('7')) {
    return `254${digits}`;
  }
  if (digits.length === 10 && digits.startsWith('07')) {
    return `254${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('254')) {
    return digits;
  }

  throw new AppError(
    ErrorCodes.VALIDATION_FAILED,
    'Phone number must be a valid Kenyan number (e.g. 0712345678, +254712345678).',
    400,
    { input },
  );
}
