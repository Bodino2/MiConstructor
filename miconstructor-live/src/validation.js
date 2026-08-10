const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration(input = {}) {
  const errors = {};
  const role = String(input.role || '').toUpperCase();
  if (!EMAIL_RE.test(String(input.email || '').trim())) errors.email = 'invalid_email';
  if (String(input.password || '').length < 10) errors.password = 'minimum_10_characters';
  if (!['CLIENT', 'PROFESSIONAL'].includes(role)) errors.role = 'invalid_role';
  if (!input.fullName || String(input.fullName).trim().length < 3) errors.fullName = 'required';
  if (!input.phone || String(input.phone).trim().length < 7) errors.phone = 'required';
  if (!input.province) errors.province = 'required';
  if (!input.municipality) errors.municipality = 'required';
  if (input.acceptPrivacy !== true) errors.acceptPrivacy = 'required';
  if (input.acceptTerms !== true) errors.acceptTerms = 'required';
  if (role === 'PROFESSIONAL') {
    if (!input.nifCif) errors.nifCif = 'required';
    if (!input.specialty) errors.specialty = 'required';
  }
  return { valid: Object.keys(errors).length === 0, errors, role };
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
