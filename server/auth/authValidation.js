// ==============================================================================
// Authentication Input Validation Rules
// Hard Constraints:
// - NO email address anywhere
// - Credentials: username + password only
// - Profile Name: 1-32 chars trimmed
// - Username: 3-24 chars, letters/numbers/underscore/dot/hyphen, no leading/trailing separators
// - Password: 10-128 chars, no composition rules
// ==============================================================================

export const USERNAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,22}[a-zA-Z0-9]$/;

export function validateProfileName(name) {
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

export function validateUsername(username) {
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

export function validatePassword(password) {
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

export function validateSignupPayload(payload = {}) {
  const errors = {};

  const profileNameCheck = validateProfileName(payload.profileName);
  if (!profileNameCheck.valid) {
    errors.profileName = profileNameCheck.error;
  }

  const usernameCheck = validateUsername(payload.username);
  if (!usernameCheck.valid) {
    errors.username = usernameCheck.error;
  }

  const passwordCheck = validatePassword(payload.password);
  if (!passwordCheck.valid) {
    errors.password = passwordCheck.error;
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors,
    data: isValid ? {
      profileName: profileNameCheck.value,
      username: usernameCheck.value,
      usernameLower: usernameCheck.lower,
      password: passwordCheck.value
    } : null
  };
}

export function validateLoginPayload(payload = {}) {
  const errors = {};

  const usernameCheck = validateUsername(payload.username);
  if (!usernameCheck.valid) {
    errors.username = usernameCheck.error;
  }

  if (typeof payload.password !== 'string' || !payload.password) {
    errors.password = 'Password is required.';
  } else if (payload.password.length > 128) {
    errors.password = 'Password must not exceed 128 characters.';
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors,
    data: isValid ? {
      username: payload.username.trim(),
      usernameLower: payload.username.trim().toLowerCase(),
      password: payload.password
    } : null
  };
}
