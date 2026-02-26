const mockError = jest.fn();
const mockDebug = jest.fn();

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		debug: mockDebug,
		info: jest.fn(),
		warn: jest.fn(),
		error: mockError,
		success: jest.fn(),
	})),
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		REQUEST_QUEUE_FULL: 'REQUEST_QUEUE_FULL',
	},
}));

const mockOnWake = jest.fn();

jest.mock('./request-state-manager', () => ({
	requestStateManager: {
		onWake: mockOnWake,
	},
}));

import {
	getQueueMetrics,
	globalQueue,
	pauseQueue,
	resumeQueue,
	scheduleRequest,
} from './request-queue';

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
