/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useApiDiscovery } from './use-api-discovery';

const mockGet = jest.fn();

jest.mock('@wcpos/hooks/use-http-client', () => ({
	useHttpClient: () => ({ get: mockGet }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

describe('useApiDiscovery', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it.each(['ECONNABORTED', 'ETIMEDOUT'])(
		'reports a translated message when the API-index request fails with %s',
		async (code) => {
			mockGet.mockRejectedValue(Object.assign(new Error('timeout of 15000ms exceeded'), { code }));

			const { result } = renderHook(() => useApiDiscovery());
			await act(async () => {
				await expect(
					result.current.discoverApiEndpoints('https://example.com/wp-json/')
				).rejects.toMatchObject({
					name: 'ApiDiscoveryError',
					message: 'The site took too long to respond — check the server and try again',
				});
			});

			expect(result.current.error).toBe(
				'The site took too long to respond — check the server and try again'
			);
			expect(mockGet).toHaveBeenCalledWith('https://example.com/wp-json/', {
				params: { wcpos: 1 },
				timeout: 15_000,
			});
		}
	);
});
