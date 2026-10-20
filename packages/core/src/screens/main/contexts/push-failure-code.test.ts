import { WriteDeferredError, WriteOutcomeError, WriteOutcomeTimeoutError } from '@wcpos/query';

import { pushFailureCode, reportPushFailure } from './push-failure-code';

const logger = { error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
const report = (error: unknown) =>
	reportPushFailure(logger as never, 'Failed to save order', error, {
		title: 'Failed to save order',
		stillSendingTitle: 'Still on its way',
		context: { orderId: 7 },
	});

describe('pushFailureCode', () => {
	it('stamps the code the sync observer stamped on the engine row', () => {
		expect(pushFailureCode(new WriteOutcomeError('write-rejected', 'm-1', 400, 'bad'))).toBe(
			'SYNC201'
		);
		expect(pushFailureCode(new WriteOutcomeError('write-conflict', 'm-1', 409))).toBe('SYNC221');
		expect(pushFailureCode(new WriteDeferredError('m-1', 401))).toBe('AUTH101');
		expect(pushFailureCode(new WriteOutcomeError('write-rejected', 'm-1', 403))).toBe('AUTH201');
		expect(pushFailureCode(new Error('local'), 'CHECKOUT101')).toBe('CHECKOUT101');
		// An invalid field is SYNC211 ("correct the value"), as on the observer's row.
		expect(
			pushFailureCode(new WriteOutcomeError('write-rejected', 'm-1', 400, 'rest_invalid_param'))
		).toBe('SYNC211');
		expect(
			pushFailureCode(new WriteOutcomeError('write-rejected', 'm-1', 400, 'pos_data_invalid'))
		).toBe('SYNC211');
	});
});

describe('reportPushFailure', () => {
	beforeEach(() => jest.clearAllMocks());

	it('only toasts a store refusal the engine already logged, with the store’s sentence', () => {
		report(new WriteOutcomeError('write-rejected', 'm-1', 400, 'invalid', 'Email already in use.'));

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith(
			'Failed to save order',
			expect.objectContaining({
				showToast: true,
				code: 'SYNC201',
				toast: { type: 'error', title: 'Email already in use.' },
				context: expect.objectContaining({ orderId: 7, reportedBy: 'sync-observer' }),
			})
		);
	});

	it('lets the session code speak for a 401 hold, as a warning toast', () => {
		report(new WriteDeferredError('m-1', 401));

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith(
			'Failed to save order',
			expect.objectContaining({ code: 'AUTH101', toast: { type: 'warning' } })
		);
	});

	it('warns that a timed-out write is still sending, never "failed"', () => {
		report(new WriteOutcomeTimeoutError('m-1', { queueDepth: 3 }));

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			'Failed to save order',
			expect.objectContaining({
				showToast: true,
				code: 'SYNC191',
				toast: { title: 'Still on its way' },
				context: expect.objectContaining({ pushState: { queueDepth: 3 } }),
			})
		);
	});

	it('writes the one error row for a failure the engine never saw', () => {
		report(new Error('Engine resident "x" is missing'));

		expect(logger.debug).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith('Failed to save order', {
			showToast: true,
			code: 'SYNC999',
			toast: { title: 'Failed to save order' },
			context: { orderId: 7, error: 'Engine resident "x" is missing' },
		});
	});
});
