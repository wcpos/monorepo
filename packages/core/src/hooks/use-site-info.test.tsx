/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';

import { useSiteInfo } from './use-site-info';

const mockGet = jest.fn();
const mockIncrementalPatch = jest.fn();
const mockHttp = { get: mockGet };
const mockSite = {
	wp_api_url: 'https://store.example.test/wp-json/',
	url: 'https://store.example.test',
	incrementalPatch: mockIncrementalPatch,
};

jest.mock('@wcpos/hooks/use-http-client', () => ({
	useHttpClient: () => mockHttp,
}));

describe('useSiteInfo', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGet.mockResolvedValue({
			status: 200,
			data: { wcpos_version: '1.9.6' },
		});
		mockIncrementalPatch.mockResolvedValue(undefined);
	});

	it('preserves the saved license when the site-info response omits it', async () => {
		renderHook(() => useSiteInfo({ site: mockSite as never }));

		await waitFor(() => expect(mockIncrementalPatch).toHaveBeenCalledTimes(1));

		expect(mockIncrementalPatch.mock.calls[0]?.[0]).not.toHaveProperty('license');
	});
});
