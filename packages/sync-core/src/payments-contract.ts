export function parsePaymentsContract(value: unknown): { major: number; minor: number } | null {
	if (typeof value !== 'string' || !/^\d+\.\d+$/.test(value)) return null;
	const [major, minor] = value.split('.').map(Number);
	return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : null;
}
