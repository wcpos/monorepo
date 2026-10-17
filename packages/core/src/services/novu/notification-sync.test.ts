import { getLogger } from '@wcpos/utils/logger';
import type { NotificationCollection } from '@wcpos/database';

import { syncNotificationsToRxDB, syncNotificationToRxDB } from './notification-sync';

import type { NovuNotification } from './client';

const mockToastShow = jest.fn();
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

describe('syncNotificationsToRxDB', () => {
	it('does not overwrite newer local read state with an older snapshot', async () => {
		let stored = {
			id: 'notification-1',
			subscriberId: 'subscriber-1',
			title: 'Welcome',
			body: 'Hello',
			status: 'read',
			seen: true,
			createdAt: 1,
			workflowId: null,
			channel: 'in_app',
		};
		const document = {
			incrementalModify: jest.fn(async (modify: (current: typeof stored) => typeof stored) => {
				stored = modify(stored);
				return undefined;
			}),
		};
		const collection = {
			findOne: jest.fn(() => ({ exec: jest.fn(async () => document) })),
			insert: jest.fn(),
			upsert: jest.fn(async (next) => {
				stored = next;
				return undefined;
			}),
		} as unknown as NotificationCollection;
		const staleSnapshot = {
			id: 'notification-1',
			subject: 'Welcome',
			body: 'Hello',
			isRead: false,
			isSeen: false,
			createdAt: new Date(1).toISOString(),
			channelType: 'in_app',
		} as NovuNotification;

		await syncNotificationsToRxDB(collection, 'subscriber-1', [staleSnapshot]);

		expect(stored).toMatchObject({ status: 'read', seen: true });
	});
});

describe('new notification behaviour', () => {
	const collection = {
		findOne: jest.fn(() => ({ exec: jest.fn(async () => null) })),
		insert: jest.fn(async () => undefined),
		upsert: jest.fn(async () => undefined),
	} as unknown as NotificationCollection;
	const logger = getLogger([]) as unknown as Record<'info' | 'warn' | 'error' | 'debug', jest.Mock>;

	beforeEach(() => jest.clearAllMocks());

	it('shows an announcement (saveToDb: false) as a toast with no Logs row', async () => {
		await syncNotificationToRxDB(
			collection,
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
			collection,
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
		const failing = {
			findOne: jest.fn(() => ({ exec: jest.fn(async () => null) })),
			insert: jest.fn(async () => {
				throw new Error('storage gone');
			}),
			upsert: jest.fn(async () => {
				throw new Error('storage gone');
			}),
		} as unknown as NotificationCollection;

		await syncNotificationToRxDB(failing, 'subscriber-1', {
			id: 'n-3',
			subject: 'Hello',
		} as unknown as NovuNotification);

		expect(logger.warn).toHaveBeenCalledWith(
			'Novu: Failed to sync notification to RxDB',
			expect.objectContaining({ code: 'SYNC101' })
		);
	});
});
