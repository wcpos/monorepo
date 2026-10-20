// Mock factories MUST inline their jest.fn() creations. jest.mock calls are
// hoisted above the module's top-level statements, so referencing an
// outer-scope `const mockFn = jest.fn()` from inside a factory hits a TDZ
// error at import time.
jest.mock('@wcpos/utils/logger', () => {
	const debug = jest.fn();
	const error = jest.fn();
	const warn = jest.fn();
	return {
		getLogger: jest.fn(() => ({
			debug,
			info: jest.fn(),
			warn,
			error,
			success: jest.fn(),
		})),
		__debug: debug,
		__error: error,
		__warn: warn,
	};
});

jest.mock('./request-state-manager', () => ({
	requestStateManager: {
		onWake: jest.fn(),
	},
}));

/* eslint-disable import/first -- mocks must precede the code under test */
import {
	getQueueMetrics,
	isDroppedRequestError,
	pauseQueue,
	resumeQueue,
	scheduleRequest,
} from './request-queue';
import { requestStateManager } from './request-state-manager';
/* eslint-enable import/first */

const loggerMock = jest.requireMock('@wcpos/utils/logger') as {
	__debug: jest.Mock;
	__error: jest.Mock;
	__warn: jest.Mock;
};
const mockDebug = loggerMock.__debug;
const mockError = loggerMock.__error;
const mockWarn = loggerMock.__warn;
const mockOnWake = requestStateManager.onWake as jest.Mock;

describe('request-queue', () => {
	beforeEach(() => {
		// Only clear logger mocks; onWake is called once at module init and we
		// assert on it separately, so we must not wipe its call history.
		mockError.mockClear();
		mockDebug.mockClear();
		mockWarn.mockClear();
	});

	describe('scheduleRequest', () => {
		it('should resolve with the result of the scheduled function', async () => {
			const result = await scheduleRequest(() => Promise.resolve('hello'));
			expect(result).toBe('hello');
		});

		it('should reject when the scheduled function throws', async () => {
			await expect(scheduleRequest(() => Promise.reject(new Error('fail')))).rejects.toThrow(
				'fail'
			);
		});
	});

	describe('pauseQueue', () => {
		it('should call debug logger', () => {
			pauseQueue();
			expect(mockDebug).toHaveBeenCalled();
		});
	});

	describe('resumeQueue', () => {
		it('should call debug logger', () => {
			resumeQueue();
			expect(mockDebug).toHaveBeenCalled();
		});
	});

	describe('getQueueMetrics', () => {
		it('should return running and queued counts', () => {
			const metrics = getQueueMetrics();
			expect(metrics).toHaveProperty('running');
			expect(metrics).toHaveProperty('queued');
			// running() returns a Promise in Bottleneck, queued() returns a number
			expect(metrics.running).toBeDefined();
			expect(typeof metrics.queued).toBe('number');
		});
	});

	describe('wake handler registration', () => {
		it('should register a wake handler on requestStateManager', () => {
			expect(mockOnWake).toHaveBeenCalledWith(expect.any(Function));
		});
	});

	// These share the module's one queue, so they run last and leave it drained.
	describe('dropped requests', () => {
		const wake = () => (mockOnWake.mock.calls[0][0] as () => void)();
		const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
		// Bottleneck admits submissions one at a time behind an async lock.
		const until = async (condition: () => boolean) => {
			for (let tick = 0; tick < 200 && !condition(); tick += 1) await flush();
			expect(condition()).toBe(true);
		};
		const burstWindow = () => new Promise((resolve) => setTimeout(resolve, 1100));
		const held = () => {
			let release: () => void = () => undefined;
			const promise = new Promise<string>((resolve) => {
				release = () => resolve('done');
			});
			return { promise, release: () => release() };
		};

		it('keeps serving requests after a wake clears a backlog', async () => {
			const gates = Array.from({ length: 15 }, held);
			const settled = gates.map((gate, index) =>
				scheduleRequest(() => gate.promise, `GET /stale/${index}`).then(
					(value) => ({ ok: true as const, value }),
					(error: unknown) => ({ ok: false as const, error })
				)
			);
			await until(() => getQueueMetrics().queued === 5);

			wake();
			await flush();

			// The backlog is settled honestly, and new work still runs.
			await expect(scheduleRequest(() => Promise.resolve('fresh'))).resolves.toBe('fresh');
			gates.forEach((gate) => gate.release());
			const results = await Promise.all(settled);
			expect(results.filter((result) => result.ok)).toHaveLength(10);
			const dropped = results.filter((result) => !result.ok);
			expect(dropped).toHaveLength(5);
			dropped.forEach((result) => expect(isDroppedRequestError(result.error)).toBe(true));

			await burstWindow();
			expect(mockWarn).toHaveBeenCalledTimes(1);
			expect(mockWarn).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					code: 'CLIENT131',
					context: expect.objectContaining({ reason: 'stale-after-wake', droppedCount: 5 }),
				})
			);
			expect(mockError).not.toHaveBeenCalled();
		});

		it('reports an overflow burst once as CLIENT131, naming what was dropped', async () => {
			const gates = Array.from({ length: 61 }, held);
			const dropped: unknown[] = [];
			const settled = gates.map((gate, index) =>
				scheduleRequest(() => gate.promise, `POST /orders/${index}`).catch((error: unknown) => {
					dropped.push(error);
				})
			);
			// 10 run, 50 fill the queue to its high-water mark, and the 61st makes
			// Bottleneck's BLOCK strategy drop the whole backlog plus itself.
			await until(() => dropped.length === 51);
			gates.forEach((gate) => gate.release());
			await Promise.all(settled);
			expect(dropped).toHaveLength(51);
			dropped.forEach((error) => expect(isDroppedRequestError(error)).toBe(true));

			await burstWindow();
			expect(mockError).toHaveBeenCalledTimes(1);
			expect(mockError).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					code: 'CLIENT131',
					showToast: true,
					context: expect.objectContaining({
						reason: 'overflow',
						droppedCount: 51,
						requests: expect.arrayContaining(['POST /orders/10']),
					}),
				})
			);
		});
	});
});
