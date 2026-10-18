export { APP_PAYMENTS_CONTRACT } from '@wcpos/utils/payments-contract';

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
