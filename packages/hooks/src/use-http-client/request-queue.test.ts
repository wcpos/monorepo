// Mock factories MUST inline their jest.fn() creations. jest.mock calls are
// hoisted above the module's top-level statements, so referencing an
// outer-scope `const mockFn = jest.fn()` from inside a factory hits a TDZ
// error at import time.
jest.mock('@wcpos/utils/logger', () => {
	const debug = jest.fn();
	const error = jest.fn();
	return {
		getLogger: jest.fn(() => ({
			debug,
			info: jest.fn(),
			warn: jest.fn(),
			error,
			success: jest.fn(),
		})),
		__debug: debug,
		__error: error,
	};
});

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		REQUEST_QUEUE_FULL: 'REQUEST_QUEUE_FULL',
	},
}));

jest.mock('./request-state-manager', () => ({
	requestStateManager: {
		onWake: jest.fn(),
	},
}));

/* eslint-disable import/first -- mocks must precede the code under test */
import {
	getQueueMetrics,
	globalQueue,
	pauseQueue,
	resumeQueue,
	scheduleRequest,
} from './request-queue';
import { requestStateManager } from './request-state-manager';
/* eslint-enable import/first */

const loggerMock = jest.requireMock('@wcpos/utils/logger') as {
	__debug: jest.Mock;
	__error: jest.Mock;
};
const mockDebug = loggerMock.__debug;
const mockError = loggerMock.__error;
const mockOnWake = requestStateManager.onWake as jest.Mock;

describe('request-queue', () => {
	beforeEach(() => {
		// Only clear logger mocks; onWake is called once at module init and we
		// assert on it separately, so we must not wipe its call history.
		mockError.mockClear();
		mockDebug.mockClear();
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

	describe('globalQueue', () => {
		it('should be a Bottleneck instance', () => {
			expect(globalQueue).toBeDefined();
			expect(typeof globalQueue.schedule).toBe('function');
		});
	});

	describe('wake handler registration', () => {
		it('should register a wake handler on requestStateManager', () => {
			expect(mockOnWake).toHaveBeenCalledWith(expect.any(Function));
		});
	});
});
