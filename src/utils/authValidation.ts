// ==============================================================================
// Authentication Input Validation Rules (Shared / TypeScript)
// Hard Constraints:
// - NO email address anywhere
// - Credentials: username + password only
// - Profile Name: 1-32 chars trimmed
// - Username: 3-24 chars, letters/numbers/underscore/dot/hyphen, no leading/trailing separators
// - Password: 10-128 chars, no composition rules
// ==============================================================================

export const USERNAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,22}[a-zA-Z0-9]$/;

export interface ValidationResult<T = string> {
  valid: boolean;
  error?: string;
  value?: T;
  lower?: string;
}

export function validateProfileName(name: any): ValidationResult {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Profile Name is required.' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 1) {
    return { valid: false, error: 'Profile Name is required.' };
  }
  if (trimmed.length > 32) {
    return { valid: false, error: 'Profile Name must be 32 characters or fewer.' };
  }
  return { valid: true, value: trimmed };
}

export function validateUsername(username: any): ValidationResult {
  if (typeof username !== 'string') {
    return { valid: false, error: 'Username is required.' };
  }
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 24) {
    return { valid: false, error: 'Username must be between 3 and 24 characters.' };
  }
  if (/^[._-]/.test(trimmed) || /[._-]$/.test(trimmed)) {
    return { valid: false, error: 'Username cannot start or end with separators (._-).' };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return { valid: false, error: 'Username may only contain letters, numbers, underscores, dots, and hyphens.' };
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    return { valid: false, error: 'Invalid username format.' };
  }
  return { valid: true, value: trimmed, lower: trimmed.toLowerCase() };
}

export function validatePassword(password: any): ValidationResult {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 10) {
    return { valid: false, error: 'Password must be at least 10 characters.' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must not exceed 128 characters.' };
  }
  return { valid: true, value: password };
}
