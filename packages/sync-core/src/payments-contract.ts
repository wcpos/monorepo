export function parsePaymentsContract(value: unknown): { major: number; minor: number } | null {
	if (typeof value !== 'string' || !/^\d+\.\d+$/.test(value)) return null;
	const [major, minor] = value.split('.').map(Number);
	return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : null;
}

export function paymentsContractAtLeast(value: unknown, floor: string): boolean {
	const parsed = parsePaymentsContract(value);
	const minimum = parsePaymentsContract(floor);
	return (
		!!parsed &&
		!!minimum &&
		(parsed.major > minimum.major ||
			(parsed.major === minimum.major && parsed.minor >= minimum.minor))
	);
}

/** Woo serializes integer order meta as strings; missing/invalid epochs predate 1.3. */
export function readMoneyEpoch(meta: unknown): number {
	const value = Array.isArray(meta)
		? meta.find((entry) => entry?.key === '_wcpos_money_epoch')?.value
		: undefined;
	const epoch = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
	return typeof epoch === 'number' && Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
}
