/**
 * A v4 uuid without the `uuid` package: that package ships ESM only, which jest on CI's node
 * cannot `require`, and every runtime here (web, Hermes with its polyfill, node) exposes
 * `crypto`. `randomUUID` where it exists, otherwise sixteen random bytes with the v4 bits set.
 */
export function mintUuid(): string {
	const id = globalThis.crypto?.randomUUID?.();
	if (id) return id;
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
