/** @jest-environment node */

import { getCustomerDisplayService, startCustomerDisplayService } from './index';

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
	service.stop();
});
