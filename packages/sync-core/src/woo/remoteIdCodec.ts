export type RemoteId = string & { readonly __brand: 'RemoteId' };

const decimalRemoteId = /^\d+$/;

/** Wire integer (safe int > 0) → RemoteId (decimal string). Throws with `label` context otherwise. */
export function mintRemoteId(value: unknown, label: string): RemoteId {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${label} must be a safe integer greater than zero`);
	}
	return String(value) as RemoteId;
}

/** Lenient: safe int > 0, or an all-digit string > 0 → RemoteId; anything else → null. */
export function remoteIdOrNull(value: unknown): RemoteId | null {
	if (typeof value === 'number') {
		return Number.isSafeInteger(value) && value > 0 ? (String(value) as RemoteId) : null;
	}
	if (typeof value !== 'string' || !decimalRemoteId.test(value) || BigInt(value) <= 0n) {
		return null;
	}
	return BigInt(value).toString() as RemoteId;
}

/** Driver-side inverse for wire/manifest edges. Throws on non-numeric. */
export function wooIdOf(remoteId: RemoteId): number {
	const wooId = Number(remoteId);
	if (!decimalRemoteId.test(remoteId) || !Number.isSafeInteger(wooId) || wooId <= 0) {
		throw new Error(`Remote id is non-numeric: ${remoteId}`);
	}
	return wooId;
}

/** Woo ordering (numeric). */
export function compareRemoteIds(a: RemoteId, b: RemoteId): number {
	const aNumeric = BigInt(a);
	const bNumeric = BigInt(b);
	return aNumeric < bNumeric ? -1 : aNumeric > bNumeric ? 1 : 0;
}
