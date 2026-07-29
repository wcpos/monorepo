import {
	clearRecorder,
	RECORDER_MAX_BYTES,
	RECORDER_MAX_EVENTS,
	recorderStats,
	recordEvent,
	snapshotRecorder,
} from './flight-recorder';

function record(message: string, index = 0) {
	recordEvent({
		timestamp: index,
		level: 'debug',
		message,
		context: { index },
	});
}

describe('flight recorder', () => {
	afterEach(clearRecorder);

	it('evicts oldest events first when the count cap is exceeded', () => {
		for (let index = 0; index <= RECORDER_MAX_EVENTS; index += 1) {
			record(`event-${index}`, index);
		}

		const snapshot = snapshotRecorder();
		expect(snapshot).toHaveLength(RECORDER_MAX_EVENTS);
		expect(snapshot[0].message).toBe('event-1');
		expect(snapshot.at(-1)?.message).toBe(`event-${RECORDER_MAX_EVENTS}`);
	});

	it('evicts on the byte cap before reaching the count cap', () => {
		for (let index = 0; index < 9; index += 1) {
			record(`${index}-${'x'.repeat(8 * 1024)}`, index);
		}

		const snapshot = snapshotRecorder();
		expect(snapshot.length).toBeLessThan(9);
		expect(snapshot.length).toBeLessThan(RECORDER_MAX_EVENTS);
		expect(snapshot[0].message).not.toMatch(/^0-/);
		expect(recorderStats().bytes).toBeLessThanOrEqual(RECORDER_MAX_BYTES);
	});

	it('tracks a running byte total matching the recorded event sizes', () => {
		record('first', 1);
		record('second', 2);
		record('third', 3);

		const recomputed = snapshotRecorder().reduce((total, event) => total + event.sizeBytes, 0);
		expect(recorderStats()).toEqual({ events: 3, bytes: recomputed });
	});

	it('drops a single event larger than the byte cap', () => {
		record('x'.repeat(RECORDER_MAX_BYTES + 1));

		expect(snapshotRecorder()).toEqual([]);
		expect(recorderStats()).toEqual({ events: 0, bytes: 0 });
	});

	it('ignores an event whose context cannot be serialized', () => {
		expect(() =>
			recordEvent({
				timestamp: 1,
				level: 'debug',
				message: 'BigInt context',
				context: { value: BigInt(1) },
			})
		).not.toThrow();
		expect(recorderStats()).toEqual({ events: 0, bytes: 0 });
	});

	it('clears all events and bytes', () => {
		record('first');
		clearRecorder();

		expect(snapshotRecorder()).toEqual([]);
		expect(recorderStats()).toEqual({ events: 0, bytes: 0 });
	});
});
