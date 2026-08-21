/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useAuthTesting } from './use-auth-testing';

const mockGet = jest.fn();

jest.mock('@wcpos/hooks/use-http-client', () => ({
	useHttpClient: () => ({ get: mockGet }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('useAuthTesting', () => {
	beforeEach(() => {
		mockGet.mockReset().mockResolvedValue({ data: { status: 'success' } });
	});

	it.each([
		['https://example.test/wp-json/wcpos/v2/', 'https://example.test/wp-json/wcpos/v2/auth/test'],
		[
			'https://example.test/?rest_route=/wcpos/v2/',
			'https://example.test/?rest_route=/wcpos/v2/auth/test',
		],
	])('tests authorization at %s through the expected transport', async (baseUrl, expected) => {
		const { result } = renderHook(() => useAuthTesting());

		await act(async () => {
			await result.current.testAuthorizationMethod(baseUrl, 'test-token', '1.10.0');
		});

		expect(mockGet.mock.calls[0]?.[0]).toBe(expected);
	});
});
