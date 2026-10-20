import { getLogger } from '@wcpos/utils/logger';
import type { StoreLocalDatabase } from '@wcpos/query';

import { syncNotificationToRxDB } from './notification-sync';

import type { NovuNotification } from './client';

// The write itself (and its older-snapshot rule) is pinned in
// packages/query/tests/notification-commands.test.ts; these cases pin what the
// sync does around it: the toast/row behaviour per workflow.
const mockUpsertNotification = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('@wcpos/query', () => ({
	upsertNotification: (...args: unknown[]) => mockUpsertNotification(...args),
}));
const mockToastShow = jest.fn();
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

describe('new notification behaviour', () => {
	const database = {} as StoreLocalDatabase;
	const logger = getLogger([]) as unknown as Record<'info' | 'warn' | 'error' | 'debug', jest.Mock>;

	beforeEach(() => jest.clearAllMocks());

	it('shows an announcement (saveToDb: false) as a toast with no Logs row', async () => {
		await syncNotificationToRxDB(
			database,
			'subscriber-1',
			{
				id: 'n-1',
				subject: 'New feature',
				body: 'Try it',
				data: { workflowId: 'announcement' },
			} as unknown as NovuNotification,
			true
		);

		expect(mockToastShow).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'info', title: 'New feature', description: 'Try it' })
		);
		expect(logger.info).not.toHaveBeenCalledWith('New feature', expect.anything());
	});

	it('keeps a licence expiry’s own subject as the toast title and codes it LICENSE101', async () => {
		await syncNotificationToRxDB(
			database,
			'subscriber-1',
			{
				id: 'n-2',
				subject: 'Your licence has expired',
				body: 'Renew it',
				data: { workflowId: 'license-expired' },
			} as unknown as NovuNotification,
			true
		);

		expect(logger.error).toHaveBeenCalledWith(
			'Your licence has expired',
			expect.objectContaining({
				code: 'LICENSE101',
				toast: expect.objectContaining({ title: 'Your licence has expired' }),
			})
		);
	});

	it('keeps a coded SYNC101 row when the local notification write rejects', async () => {
		mockUpsertNotification.mockRejectedValueOnce(new Error('storage gone'));

		await syncNotificationToRxDB(database, 'subscriber-1', {
			id: 'n-3',
			subject: 'Hello',
		} as unknown as NovuNotification);

		expect(logger.warn).toHaveBeenCalledWith(
			'Novu: Failed to sync notification to RxDB',
			expect.objectContaining({ code: 'SYNC101' })
		);
	});
});
