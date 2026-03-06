/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { usePushDocument } from './use-push-document';

const mockPost = jest.fn();

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		error: jest.fn(),
	})),
}));

jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock(
	'@wcpos/hooks/use-http-client/parse-wp-error',
	() => ({
		extractErrorMessage: jest.fn(() => 'Failed to send to server'),
	}),
	{ virtual: true }
);

jest.mock('../contexts/storage-health/provider', () => ({
	useStorageHealth: () => ({
		status: 'degraded',
		isDegraded: true,
	}),
}));

jest.mock('../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({
		post: mockPost,
	}),
}));

const mockError = (
	(getLogger as unknown as jest.Mock).mock.results[0].value as {
		error: jest.Mock;
	}
).error;

describe('usePushDocument', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('rejects immediately when storage health is degraded', async () => {
		const getLatest = jest.fn();
		const { result } = renderHook(() => usePushDocument());

		await expect(
			result.current({
				id: 42,
				collection: { name: 'orders' },
				getLatest,
			} as any)
		).rejects.toThrow('storage unavailable');

		expect(getLatest).not.toHaveBeenCalled();
		expect(mockPost).not.toHaveBeenCalled();
		expect(mockError).toHaveBeenCalled();
	});
});
