/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { PREFLIGHT_BLOCK } from '@wcpos/hooks/use-http-client/request-state-manager';

import { useOrderRefunds } from './use-order-refunds';

const mockGet = jest.fn();
let rejectRequest: (error: Error) => void;

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));

beforeEach(() => {
	mockGet.mockReset();
	mockGet.mockReturnValue(
		new Promise((_, reject) => {
			rejectRequest = reject;
		})
	);
});

describe('useOrderRefunds', () => {
	it('resolves to null when the client is offline', async () => {
		const { result } = renderHook(() => useOrderRefunds(7));
		await act(async () => {
			rejectRequest(
				Object.assign(new Error('No internet connection'), {
					isPreFlightBlocked: true,
					blockCode: PREFLIGHT_BLOCK.OFFLINE,
				})
			);
		});
		expect(result.current.read()).toBeNull();
	});

	it('resolves to null when the app is in the background', async () => {
		const { result } = renderHook(() => useOrderRefunds(7));
		await act(async () => {
			rejectRequest(
				Object.assign(new Error('App is in background'), {
					isPreFlightBlocked: true,
					blockCode: PREFLIGHT_BLOCK.ASLEEP,
					isSleeping: true,
				})
			);
		});
		expect(result.current.read()).toBeNull();
	});

	it('still fails for a real error', async () => {
		const { result } = renderHook(() => useOrderRefunds(7));
		const error = new Error('HTTP 500');
		await act(async () => {
			rejectRequest(error);
		});
		expect(() => result.current.read()).toThrow(error);
	});
});
