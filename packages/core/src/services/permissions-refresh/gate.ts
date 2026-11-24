import type { PermissionsSignal } from './signal';

// Every sync request of a cashier who lost access answers 403.
export const REFUSED_RETRY_MS = 60_000;

export function createPermissionsRefreshGate({
	now = Date.now,
	retryAfterMs = REFUSED_RETRY_MS,
}: { now?: () => number; retryAfterMs?: number } = {}) {
	let heldStamp: string | undefined;
	let triggeringStamp: string | undefined;
	let inFlight = false;
	let lastReadAt: number | undefined;
	return {
		shouldRead(signal: PermissionsSignal): boolean {
			if (inFlight) return false;
			if (signal.kind === 'stamp' && signal.stamp === heldStamp) return false;
			const startedAt = now();
			if (
				signal.kind === 'refused' &&
				lastReadAt !== undefined &&
				startedAt - lastReadAt < retryAfterMs
			)
				return false;
			inFlight = true;
			lastReadAt = startedAt;
			triggeringStamp = signal.kind === 'stamp' ? signal.stamp : undefined;
			return true;
		},
		settled(_result: { ok: boolean; stamp?: string }): void {
			// Hold even a failed stamp so the next sync request does not repeat the read.
			if (triggeringStamp !== undefined) heldStamp = triggeringStamp;
			inFlight = false;
		},
		reset(): void {
			heldStamp = undefined;
			lastReadAt = undefined;
		},
	};
}
