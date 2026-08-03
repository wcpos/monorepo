import { type DecodedBarcode, startDecodeLoop } from './decode-loop';

// Let the async tick body (grabFrame → detect → callbacks) settle, then fire
// the next scheduled timer.
async function advanceOneTick(ms = 200) {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	jest.advanceTimersByTime(ms);
}

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

describe('startDecodeLoop', () => {
	it('delivers decoded barcodes and keeps looping', async () => {
		const results: DecodedBarcode[][] = [];
		const frames = [
			[{ rawValue: '4006381333931', format: 'ean_13' }],
			[],
			[{ rawValue: '12345670', format: 'ean_8' }],
		];
		let call = 0;
		const stop = startDecodeLoop<string>({
			grabFrame: async () => 'frame',
			detect: async () => frames[Math.min(call++, frames.length - 1)],
			onResult: (barcodes) => results.push(barcodes),
			onError: () => {
				throw new Error('unexpected error callback');
			},
		});

		await advanceOneTick();
		await advanceOneTick();
		await advanceOneTick();

		// Every successful detect is delivered so callers can clear decoder errors,
		// even when the recovered frame contains no barcode.
		expect(results).toEqual([
			[{ rawValue: '4006381333931', format: 'ean_13' }],
			[],
			[{ rawValue: '12345670', format: 'ean_8' }],
		]);
		stop();
	});

	it('skips not-ready frames without error and without result', async () => {
		const onResult = jest.fn();
		const onError = jest.fn();
		const detect = jest.fn();
		const stop = startDecodeLoop<string>({
			grabFrame: async () => null,
			detect,
			onResult,
			onError,
		});

		await advanceOneTick();
		await advanceOneTick();

		expect(detect).not.toHaveBeenCalled();
		expect(onResult).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		stop();
	});

	it('reports every failure with consecutive/total stats and releases the frame', async () => {
		const released: string[] = [];
		const errors: { consecutive: number; total: number }[] = [];
		let call = 0;
		const stop = startDecodeLoop<string>({
			grabFrame: async () => `frame-${call++}`,
			detect: async (frame) => {
				// fail, fail, succeed, fail
				if (frame === 'frame-2') {
					return [{ rawValue: 'ok', format: 'qr_code' }];
				}
				throw new Error(`decode failed on ${frame}`);
			},
			releaseFrame: (frame) => released.push(frame),
			onResult: () => {},
			onError: (_error, stats) => errors.push({ ...stats }),
		});

		await advanceOneTick();
		await advanceOneTick();
		await advanceOneTick();
		await advanceOneTick();

		// Failed frames are still released (bitmap.close must always run).
		expect(released).toEqual(['frame-0', 'frame-1', 'frame-2', 'frame-3']);
		// consecutive resets after the success on frame-2.
		expect(errors).toEqual([
			{ consecutive: 1, total: 1 },
			{ consecutive: 2, total: 2 },
			{ consecutive: 1, total: 3 },
		]);
		stop();
	});

	it('stops scheduling and suppresses callbacks after stop()', async () => {
		const onResult = jest.fn();
		const grabFrame = jest.fn(async () => 'frame');
		const stop = startDecodeLoop<string>({
			grabFrame,
			detect: async () => [{ rawValue: 'x', format: 'qr_code' }],
			onResult,
			onError: () => {},
		});

		await advanceOneTick();
		const callsAfterFirstTick = grabFrame.mock.calls.length;
		stop();
		await advanceOneTick();
		await advanceOneTick();

		expect(grabFrame.mock.calls.length).toBe(callsAfterFirstTick);
		stop(); // idempotent
	});
});
