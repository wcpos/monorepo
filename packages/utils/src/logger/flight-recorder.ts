import type { LogTerminalFields } from './index';

export type RecordedEvent = {
	timestamp: number;
	level: 'debug';
	message: string;
	context: Record<string, unknown>;
	terminal?: LogTerminalFields;
	/** Serialized size charged to the ring's byte budget. */
	sizeBytes: number;
};

export const RECORDER_MAX_EVENTS = 100;
export const RECORDER_MAX_BYTES = 64 * 1024;

const events: RecordedEvent[] = [];
let totalBytes = 0;

function serializedBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function recordEvent(event: Omit<RecordedEvent, 'sizeBytes'>): void {
	try {
		const sizeBytes = serializedBytes(event);
		// Drop a single oversized event so the byte cap remains a hard bound.
		if (sizeBytes > RECORDER_MAX_BYTES) return;

		events.push({ ...event, sizeBytes });
		totalBytes += sizeBytes;

		// `events.length > 0` is the loop's real termination guard. The byte total is
		// only ever adjusted in lockstep with the array, so it cannot currently drift
		// — but if it ever did, a byte-cap-only condition would spin forever on an
		// empty ring and hang the app inside a logging call. A lost row is an
		// acceptable failure here; a frozen POS is not.
		while (
			events.length > 0 &&
			(events.length > RECORDER_MAX_EVENTS || totalBytes > RECORDER_MAX_BYTES)
		) {
			const removed = events.shift();
			if (removed) totalBytes -= removed.sizeBytes;
		}
	} catch {
		// Malformed context must never escape into the caller's logging path.
	}
}

export function snapshotRecorder(): RecordedEvent[] {
	return [...events];
}

// Deliberately zero-arg: callers pass clearRecorder straight to afterEach()
// and similar callback slots, where a declared parameter would change the
// call contract (Jest arity-sniffs hooks for a done callback).
export function clearRecorder(): void {
	events.length = 0;
	totalBytes = 0;
}

/** Remove exactly the promoted events, keeping anything recorded since the snapshot. */
export function removePromotedEvents(recorded: RecordedEvent[]): void {
	const promoted = new Set(recorded);
	for (let index = events.length - 1; index >= 0; index -= 1) {
		if (!promoted.has(events[index])) continue;
		totalBytes -= events[index].sizeBytes;
		events.splice(index, 1);
	}
}

export function recorderStats(): { events: number; bytes: number } {
	return { events: events.length, bytes: totalBytes };
}
