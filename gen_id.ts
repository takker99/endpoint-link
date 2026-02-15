/**
 * Generate a unique random ID using crypto.getRandomValues.
 * @internal
 * @returns A 16-character hexadecimal string.
 */
export const genId = () => {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
};
