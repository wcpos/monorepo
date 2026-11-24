import { BehaviorSubject } from 'rxjs';

import type { PermissionsSignal } from './signal';

// Every sync request of a cashier who lost access answers 403.
export const REFUSED_RETRY_MS = 60_000;

export function createPermissionsRefreshGate({
	now = Date.now,
	retryAfterMs = REFUSED_RETRY_MS,
}: { now?: () => number; retryAfterMs?: number } = {}) {
	let heldStamp: string | undefined;
	let triggeringStamp: string | undefined;
	let lastReadAt: number | undefined;
	const reading = new BehaviorSubject(false);
	const setReading = (value: boolean) => {
		if (reading.value !== value) reading.next(value);
	};
	return {
		reading$: reading.asObservable(),
		// A manual read waits only for a read in flight; it skips the held stamp and the 403 window.
		shouldRead(signal: PermissionsSignal | { kind: 'manual' }): boolean {
			if (reading.value) return false;
			if (signal.kind === 'stamp' && signal.stamp === heldStamp) return false;
			const startedAt = now();
			if (
				signal.kind === 'refused' &&
				lastReadAt !== undefined &&
				startedAt - lastReadAt < retryAfterMs
			)
				return false;
			setReading(true);
			lastReadAt = startedAt;
			triggeringStamp = signal.kind === 'stamp' ? signal.stamp : undefined;
			return true;
		},
		settled(_result: { ok: boolean; stamp?: string }): void {
			// Hold even a failed stamp so the next sync request does not repeat the read.
			if (triggeringStamp !== undefined) heldStamp = triggeringStamp;
			setReading(false);
		},
		reset(): void {
			heldStamp = undefined;
			lastReadAt = undefined;
		},
	};
}

export type PermissionsRefreshGate = ReturnType<typeof createPermissionsRefreshGate>;

// One gate per cashier, so the sync bridge and the Store health button never read together.
const gates = new Map<string, PermissionsRefreshGate>();

export function permissionsRefreshGateFor(uuid: string): PermissionsRefreshGate {
	let gate = gates.get(uuid);
	if (!gate) {
		gate = createPermissionsRefreshGate();
		gates.set(uuid, gate);
	}
	return gate;
}
