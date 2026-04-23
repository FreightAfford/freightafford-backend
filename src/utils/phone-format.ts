import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
} from "libphonenumber-js";

/**
 * Normalize phone number to E.164 format (for DB storage)
 */
export const normalizePhoneNumber = (phone: string): string | null => {
  const parsed = parsePhoneNumberFromString(phone);

  if (!parsed || !parsed.isValid()) return null;

  return parsed.number; // E.164 format e.g. +2349165812629
};

/**
 * Validate phone number
 */
export const validatePhoneNumber = (phone: string): boolean => {
  return isValidPhoneNumber(phone);
};

/**
 * Format phone number for display
 */
export const formatPhoneNumber = (phone: string): string => {
  const parsed = parsePhoneNumberFromString(phone);

  if (!parsed) return phone;

  return parsed.formatInternational(); // e.g. +234 916 581 2629
};
