/**
 * @jest-environment jsdom
 */

import type { NovuNotification } from './client.electron';

type NovuEvent =
	| { kind: 'notification_received'; notification: NovuNotification }
	| { kind: 'unread_count_changed'; count: number }
	| { kind: 'unseen_count_changed'; count: number }
	| { kind: 'session_ready' };

interface TestIpcRenderer {
	invoke: jest.Mock;
	on: jest.Mock;
}

const environmentKeys = [
	'EXPO_PUBLIC_NOVU_ENV',
	'NOVU_ENV',
	'EXPO_PUBLIC_NOVU_API_URL',
	'NOVU_API_URL',
	'EXPO_PUBLIC_NOVU_SOCKET_URL',
	'NOVU_SOCKET_URL',
] as const;
const originalEnvironment = Object.fromEntries(
	environmentKeys.map((key) => [key, process.env[key]])
);

function setIpcRenderer(ipcRenderer: TestIpcRenderer): void {
	(window as unknown as { ipcRenderer: TestIpcRenderer }).ipcRenderer = ipcRenderer;
}

function removeIpcRenderer(): void {
	delete (window as unknown as { ipcRenderer?: TestIpcRenderer }).ipcRenderer;
}

function createIpcRenderer() {
	const unsubscribe = jest.fn();
	let listener: ((event: NovuEvent) => void) | undefined;
	const ipcRenderer: TestIpcRenderer = {
		invoke: jest.fn().mockResolvedValue({ success: true, result: undefined }),
		on: jest.fn((_channel: string, nextListener: (event: NovuEvent) => void) => {
			listener = nextListener;
			return unsubscribe;
		}),
	};

	return { ipcRenderer, unsubscribe, emit: (event: NovuEvent) => listener?.(event) };
}

async function loadClient() {
	return import('./client.electron');
}

describe('Novu Electron client', () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		environmentKeys.forEach((key) => delete process.env[key]);
		removeIpcRenderer();
	});

	afterAll(() => {
		environmentKeys.forEach((key) => {
			const value = originalEnvironment[key];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		});
	});

	it('initializes once per subscriber and includes the Novu configuration', async () => {
		const { ipcRenderer } = createIpcRenderer();
		setIpcRenderer(ipcRenderer);
		const { getNovuClient } = await loadClient();

		const firstHandle = getNovuClient('subscriber-one', { locale: 'es' } as never);
		const cachedHandle = getNovuClient('subscriber-one', { locale: 'en' } as never);

		expect(cachedHandle).toBe(firstHandle);
		expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
		expect(ipcRenderer.invoke).toHaveBeenCalledWith('novu', {
			type: 'init',
			subscriberId: 'subscriber-one',
			locale: 'es',
			applicationIdentifier: '64qzhASJJNnb',
			apiUrl: 'https://api.notifications.wcpos.com',
			socketUrl: 'wss://ws.notifications.wcpos.com',
		});

		const nextHandle = getNovuClient('subscriber-two');

		expect(nextHandle).not.toBe(firstHandle);
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, 'novu', {
			type: 'init',
			subscriberId: 'subscriber-two',
			locale: undefined,
			applicationIdentifier: '64qzhASJJNnb',
			apiUrl: 'https://api.notifications.wcpos.com',
			socketUrl: 'wss://ws.notifications.wcpos.com',
		});
	});

	it('retries the same subscriber after initialization fails', async () => {
		const { ipcRenderer } = createIpcRenderer();
		setIpcRenderer(ipcRenderer);
		ipcRenderer.invoke
			.mockResolvedValueOnce({ success: false, message: 'main process failed' })
			.mockResolvedValueOnce({ success: true, result: true });
		const { getNovuClient } = await loadClient();

		const failedHandle = getNovuClient('subscriber-one');
		await ipcRenderer.invoke.mock.results[0].value;
		await Promise.resolve();
		const retryHandle = getNovuClient('subscriber-one');

		expect(retryHandle).not.toBe(failedHandle);
		expect(ipcRenderer.invoke).toHaveBeenCalledTimes(2);
	});

	it('dispatches each event kind, dedupes notifications, and unsubscribes', async () => {
		const { ipcRenderer, unsubscribe, emit } = createIpcRenderer();
		setIpcRenderer(ipcRenderer);
		const { subscribeToNovuEvents } = await loadClient();
		const notification = { id: 'notification-one' } as NovuNotification;
		const onNotificationReceived = jest.fn();
		const onUnreadCountChanged = jest.fn();
		const onUnseenCountChanged = jest.fn();

		const stop = subscribeToNovuEvents({
			onNotificationReceived,
			onUnreadCountChanged,
			onUnseenCountChanged,
		});

		expect(ipcRenderer.on).toHaveBeenCalledTimes(1);
		expect(ipcRenderer.on).toHaveBeenCalledWith('novu:event', expect.any(Function));

		emit({ kind: 'notification_received', notification });
		emit({ kind: 'notification_received', notification });
		emit({ kind: 'unread_count_changed', count: 4 });
		emit({ kind: 'unseen_count_changed', count: 2 });
		emit({ kind: 'session_ready' });

		expect(onNotificationReceived).toHaveBeenCalledTimes(1);
		expect(onNotificationReceived).toHaveBeenCalledWith(notification);
		expect(onUnreadCountChanged).toHaveBeenCalledWith(4);
		expect(onUnseenCountChanged).toHaveBeenCalledWith(2);

		stop();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('subscribes to events only after initialization succeeds', async () => {
		const { ipcRenderer, emit } = createIpcRenderer();
		setIpcRenderer(ipcRenderer);
		let resolveInit: (response: { success: true; result: true }) => void = () => undefined;
		ipcRenderer.invoke.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveInit = resolve;
				})
		);
		const { getNovuClient, subscribeToNovuEvents } = await loadClient();
		const onNotificationReceived = jest.fn();
		const notification = { id: 'notification-after-init' } as NovuNotification;

		getNovuClient('subscriber-one');
		subscribeToNovuEvents({ onNotificationReceived });
		emit({ kind: 'notification_received', notification });

		expect(ipcRenderer.on).not.toHaveBeenCalled();
		expect(onNotificationReceived).not.toHaveBeenCalled();

		resolveInit({ success: true, result: true });
		await Promise.resolve();
		await Promise.resolve();
		emit({ kind: 'notification_received', notification });

		expect(ipcRenderer.on).toHaveBeenCalledWith('novu:event', expect.any(Function));
		expect(onNotificationReceived).toHaveBeenCalledWith(notification);
	});

	it('maps wait, fetch, and unread count requests and unwraps their results', async () => {
		const { ipcRenderer } = createIpcRenderer();
		setIpcRenderer(ipcRenderer);
		const notification = { id: 'notification-two' } as NovuNotification;
		ipcRenderer.invoke
			.mockResolvedValueOnce({ success: true, result: true })
			.mockResolvedValueOnce({ success: true, result: [notification] })
			.mockResolvedValueOnce({ success: true, result: 7 })
			.mockResolvedValue({ success: false, message: 'main process failed' });
		const { fetchNotifications, getUnreadCount, waitForNovuReady } = await loadClient();

		await expect(waitForNovuReady(1234)).resolves.toBe(true);
		await expect(fetchNotifications(12)).resolves.toEqual([notification]);
		await expect(getUnreadCount()).resolves.toBe(7);
		await expect(waitForNovuReady()).resolves.toBe(false);
		await expect(fetchNotifications()).resolves.toEqual([]);
		await expect(getUnreadCount()).resolves.toBe(0);
		expect(ipcRenderer.invoke.mock.calls).toEqual([
			['novu', { type: 'waitReady', timeoutMs: 1234 }],
			['novu', { type: 'fetchNotifications', limit: 12 }],
			['novu', { type: 'getUnreadCount' }],
			['novu', { type: 'waitReady', timeoutMs: 5000 }],
			['novu', { type: 'fetchNotifications', limit: 50 }],
			['novu', { type: 'getUnreadCount' }],
		]);
	});

	it.each([
		[
			'markAsRead',
			['notification-three'],
			{ type: 'markAsRead', notificationId: 'notification-three' },
		],
		['markAllAsRead', [], { type: 'markAllAsRead' }],
		[
			'markAsSeen',
			['notification-four'],
			{ type: 'markAsSeen', notificationId: 'notification-four' },
		],
		['markAllAsSeen', [], { type: 'markAllAsSeen' }],
	] as const)('maps %s and returns false for a failed response', async (method, args, request) => {
		const { ipcRenderer } = createIpcRenderer();
		setIpcRenderer(ipcRenderer);
		ipcRenderer.invoke
			.mockResolvedValueOnce({ success: true, result: true })
			.mockResolvedValueOnce({ success: false, message: 'main process failed' });
		const client = await loadClient();
		const action = client[method] as (...parameters: string[]) => Promise<boolean>;

		await expect(action(...args)).resolves.toBe(true);
		await expect(action(...args)).resolves.toBe(false);
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, 'novu', request);
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, 'novu', request);
	});

	it('returns the specified defaults when the bridge fails', async () => {
		const { ipcRenderer } = createIpcRenderer();
		setIpcRenderer(ipcRenderer);
		ipcRenderer.invoke.mockRejectedValue(new Error('IPC unavailable'));
		const { fetchNotifications, getUnreadCount, waitForNovuReady } = await loadClient();

		await expect(waitForNovuReady()).resolves.toBe(false);
		await expect(fetchNotifications()).resolves.toEqual([]);
		await expect(getUnreadCount()).resolves.toBe(0);
	});

	it('disconnects and permits the same subscriber to initialize again', async () => {
		const { ipcRenderer } = createIpcRenderer();
		setIpcRenderer(ipcRenderer);
		const { disconnectNovuClient, getNovuClient } = await loadClient();

		getNovuClient('subscriber-one');
		disconnectNovuClient();
		getNovuClient('subscriber-one');

		expect(ipcRenderer.invoke.mock.calls).toEqual([
			['novu', expect.objectContaining({ type: 'init', subscriberId: 'subscriber-one' })],
			['novu', { type: 'disconnect' }],
			['novu', expect.objectContaining({ type: 'init', subscriberId: 'subscriber-one' })],
		]);
	});

	it('no-ops without throwing when ipcRenderer is missing', async () => {
		const client = await loadClient();

		expect(() => client.getNovuClient('subscriber-one')).not.toThrow();
		expect(() => client.subscribeToNovuEvents({})()).not.toThrow();
		expect(() => client.disconnectNovuClient()).not.toThrow();
		await expect(client.waitForNovuReady()).resolves.toBe(false);
		await expect(client.fetchNotifications()).resolves.toEqual([]);
		await expect(client.markAsRead('notification-one')).resolves.toBe(false);
		await expect(client.markAllAsRead()).resolves.toBe(false);
		await expect(client.markAsSeen('notification-one')).resolves.toBe(false);
		await expect(client.markAllAsSeen()).resolves.toBe(false);
		await expect(client.getUnreadCount()).resolves.toBe(0);
	});
});
