/** @jest-environment node */

import {
	getCustomerDisplayService,
	isSupportedDisplayAdvertisement,
	startCustomerDisplayService,
	stopCustomerDisplayService,
} from './index';

import type { HttpFunction } from './signaling-client';

test('starts and exposes the current singleton service', async () => {
	const http: HttpFunction = async <T>(request: Parameters<HttpFunction>[0]) => ({
		data: (request.url.endsWith('/displays') ? [] : { messages: [] }) as T,
	});
	const service = startCustomerDisplayService({
		http,
		deviceId: 'device-1',
		storeId: 7,
		siteRestRoot: '/wcpos/v2/display',
	});

	expect(getCustomerDisplayService()).toBe(service);
	await service.refreshDisplays();
	stopCustomerDisplayService();
	expect(getCustomerDisplayService()).toBeNull();
});

test.each([
	[{ contract: 1, signaling: '/wcpos/v2/display' }, true],
	[{ contract: 2, signaling: '/wcpos/v2/display' }, false],
	[{ contract: 1, signaling: '' }, false],
	[{ contract: 1, signaling: '/wp-json/display' }, false],
])('validates display advertisements against contract v1', (display, supported) => {
	expect(isSupportedDisplayAdvertisement(display)).toBe(supported);
});
