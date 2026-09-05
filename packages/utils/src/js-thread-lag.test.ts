import { createJsThreadLagAccumulator } from './js-thread-lag';

describe('JS thread lag accumulator', () => {
	it('aggregates lag and resets when the snapshot is taken', () => {
		const accumulator = createJsThreadLagAccumulator();

		[0, 16, 17, 50, 51, 100, 101, 250, 251, 500, 501, 1000, 1001].forEach((lagMs) =>
			accumulator.record(lagMs)
		);

		expect(accumulator.take()).toEqual({
			samples: 13,
			blockedMs: 3838,
			maxMs: 1001,
			buckets: {
				16: 11,
				50: 9,
				100: 7,
				250: 5,
				500: 3,
				1000: 1,
			},
		});
		expect(accumulator.take()).toEqual({
			samples: 0,
			blockedMs: 0,
			maxMs: 0,
			buckets: {
				16: 0,
				50: 0,
				100: 0,
				250: 0,
				500: 0,
				1000: 0,
			},
		});
	});
});
