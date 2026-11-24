/** @jest-environment jsdom */
import { getLogger } from '@wcpos/utils/logger';

import { readCashierPermissions, storeAnsweredWithStatus } from './read-cashier-permissions';
import { mergeStoresWithResponse } from '../../../../query/src/user-db/stores';

jest.mock('@wcpos/hooks/use-http-client', () => ({}));
jest.mock('@wcpos/query', () => ({}));
jest.mock('../../contexts/app-state', () => ({}));
jest.mock('../../../../query/src/user-db/stores', () => ({ mergeStoresWithResponse: jest.fn() }));
jest.mock('@wcpos/query/user-db', () =>
	jest.requireActual('../../../../query/src/user-db/credentials')
);

const http = { get: jest.fn() };
const site = {
	uuid: 'site-1',
	wcpos_api_url: 'https://example.com/wp-json/wcpos/v2',
	wp_api_url: 'https://example.com/wp-json/',
};
type Cashier = { id: number; access_token: string; capabilities?: string[] };
function makeWpUser() {
	let latest: Cashier = { id: 7, access_token: 'fresh-token', capabilities: ['keep', 'remove'] };
	const incrementalModify = jest.fn(async (modify: (data: Cashier) => Cashier) => {
		latest = modify({ ...latest });
	});
	return {
		uuid: 'cashier-1',
		id: 3,
		access_token: 'stale-token',
		incrementalPatch: jest.fn(async (patch: Partial<Cashier>) => {
			latest = { ...latest, ...patch };
		}),
		getLatest: () => ({ ...latest, incrementalModify }),
	};
}
let credentials: ReturnType<typeof makeWpUser>;
const read = () =>
	readCashierPermissions({
		http,
		site: site as never,
		wpCredentials: credentials as never,
		userDB: {} as never,
		user: { uuid: 'user-1' } as never,
	});

beforeEach(() => {
	jest.clearAllMocks();
	http.get.mockReset();
	credentials = makeWpUser();
});

it('reports granted and removed counts and reads with the latest cashier id and token', async () => {
	const stores = [{ id: 1, name: 'Updated store' }];
	http.get.mockResolvedValue({ data: { id: 7, capabilities: ['keep', 'new'], stores } });
	await expect(read()).resolves.toEqual({ kind: 'updated', granted: 1, removed: 1 });
	expect(http.get).toHaveBeenCalledWith(
		'https://example.com/wp-json/wcpos/v2/cashier/7',
		expect.objectContaining({
			unauthenticated: true,
			wcposPreamble: expect.objectContaining({ accessToken: 'fresh-token', purpose: 'cashier' }),
		})
	);
	expect(credentials.getLatest().capabilities).toEqual(['keep', 'new']);
	expect(mergeStoresWithResponse).toHaveBeenCalledWith(
		expect.objectContaining({ remoteStores: stores })
	);
});

it('reports unchanged capabilities, including recovered JSON after a PHP notice', async () => {
	http.get.mockResolvedValue({ data: 'PHP notice\n{"id":7,"capabilities":["remove","keep"]}' });
	await expect(read()).resolves.toEqual({ kind: 'unchanged' });
	expect(getLogger(['wcpos', 'permissions']).warn).not.toHaveBeenCalled();
});

it.each([403, 404, 500])('clears the stored list when the store answers %s', async (status) => {
	http.get.mockRejectedValue({ response: { status } });
	await expect(read()).resolves.toEqual({ kind: 'refused', status });
	expect(credentials.getLatest().capabilities).toBeUndefined();
	expect(getLogger(['wcpos', 'permissions']).warn).toHaveBeenCalledTimes(1);
});

it('keeps capabilities when the session expires', async () => {
	http.get.mockRejectedValue({ response: { status: 401 } });
	await expect(read()).resolves.toEqual({ kind: 'expired' });
	expect(credentials.getLatest().capabilities).toEqual(['keep', 'remove']);
	expect(getLogger(['wcpos', 'permissions']).warn).toHaveBeenCalledTimes(1);
});

it('keeps capabilities when there is no store answer', async () => {
	http.get.mockRejectedValue(new Error('Network unavailable'));
	await expect(read()).resolves.toEqual({ kind: 'offline' });
	expect(credentials.getLatest().capabilities).toEqual(['keep', 'remove']);
	expect(getLogger(['wcpos', 'permissions']).warn).toHaveBeenCalledTimes(1);
});

it.each([null, '<html>Bad gateway</html>', {}, { id: 99, capabilities: ['other'] }])(
	'keeps capabilities for a bad cashier body %j',
	async (data) => {
		http.get.mockResolvedValue({ data });
		await expect(read()).resolves.toEqual({ kind: 'failed' });
		expect(credentials.getLatest().capabilities).toEqual(['keep', 'remove']);
		expect(credentials.incrementalPatch).not.toHaveBeenCalled();
		expect(getLogger(['wcpos', 'permissions']).warn).toHaveBeenCalledTimes(1);
	}
);

it('does not throw when clearing capabilities fails, and warns once', async () => {
	credentials.getLatest().incrementalModify.mockRejectedValue(new Error('Write failed'));
	http.get.mockRejectedValue({ response: { status: 403 } });
	await expect(read()).resolves.toEqual({ kind: 'refused', status: 403 });
	expect(getLogger(['wcpos', 'permissions']).warn).toHaveBeenCalledTimes(1);
});

it.each([
	[{ response: { status: 403 } }, 403],
	[{ response: { status: '403' } }, null],
	[undefined, null],
	[null, null],
	[new Error('offline'), null],
])('reads only a numeric response status from %j', (error, status) => {
	expect(storeAnsweredWithStatus(error)).toBe(status);
});
