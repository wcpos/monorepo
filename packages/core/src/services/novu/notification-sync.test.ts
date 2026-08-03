import type { NotificationCollection } from '@wcpos/database';

import { syncNotificationsToRxDB } from './notification-sync';

import type { NovuNotification } from './client';

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
