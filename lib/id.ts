// Generate a RFC 4122 v4 UUID. crypto.randomUUID() is concise but only
// available in secure contexts (HTTPS / localhost) and not in every browser.
// This fallback works everywhere crypto.getRandomValues is present (~all modern
// browsers, including HTTP on non-localhost).
export function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Manual UUID v4 using getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version (4) and variant (RFC 4122).
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
