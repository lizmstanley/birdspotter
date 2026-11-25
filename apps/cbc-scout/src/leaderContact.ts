const PHONE_SEPARATORS = /[\s().-]/g;
const DIALABLE = /^\+?\d{7,15}$/;
const PLAIN_EMAIL = /^[^\s@?#&]+@[^\s@?#&]+$/;

/** Link text is untrusted, so only one dialable number becomes a `tel:` link; extensions and lists stay text. */
export function phoneHref(phone: string): string | null {
  const dial = phone.replace(PHONE_SEPARATORS, '');
  return DIALABLE.test(dial) ? `tel:${dial}` : null;
}

/** Link text is untrusted, so only a plain address becomes a `mailto:` link, with no prefilled fields. */
export function emailHref(email: string): string | null {
  const trimmed = email.trim();
  return PLAIN_EMAIL.test(trimmed) ? `mailto:${trimmed}` : null;
}
