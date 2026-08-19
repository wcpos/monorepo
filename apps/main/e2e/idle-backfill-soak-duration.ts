export const DEFAULT_IDLE_SOAK_MS = 12 * 60_000;

export function resolveIdleSoakMs(value: string | undefined): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_SOAK_MS;
}
