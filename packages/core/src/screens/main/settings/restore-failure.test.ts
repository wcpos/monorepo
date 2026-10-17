import { reportRestoreFailure } from './restore-failure';

const t = (key: string) => key;
const logger = { warn: jest.fn(), error: jest.fn() };

describe('reportRestoreFailure', () => {
	beforeEach(() => jest.clearAllMocks());

	it('tells the merchant nothing changed when offline, and to restore again once connected', () => {
		reportRestoreFailure(logger, Object.assign(new Error('offline'), { isSleeping: true }), t);

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith('Store settings not restored: offline', {
			showToast: true,
			code: 'SYNC121',
			toast: { title: 'settings.restore_offline', text2: 'settings.reconnect_then_restore' },
			context: { error: 'offline' },
		});
	});

	it('shows a store failure with the code of what the store did, never a silent row', () => {
		reportRestoreFailure(
			logger,
			Object.assign(new Error('500'), { isAxiosError: true, response: { status: 500 } }),
			t
		);

		expect(logger.error).toHaveBeenCalledWith('Failed to restore server settings', {
			showToast: true,
			code: 'SYNC131',
			context: { error: '500' },
		});
	});
});
