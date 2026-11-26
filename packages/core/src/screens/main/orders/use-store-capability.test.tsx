/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useStoreCapability } from './use-store-capability';

const mockGet = jest.fn();
let mockStatus = 'online-website-available';
// Answers are kept per session for the module's life: each test is its own site.
let site = 0;
let mockSession = { site: { uuid: 'site-0' }, store: { id: 1 } };

jest.mock('../hooks/use-rest-http-client', () => {
	const http = { get: (...args: unknown[]) => mockGet(...args) };
	return { useRestHttpClient: () => http };
});
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('../../../contexts/app-state', () => ({ useStoreSession: () => mockSession }));

// Inside act, so a state set by a settled GET has rendered before a "stays hidden" assertion.
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
	jest.clearAllMocks();
	mockStatus = 'online-website-available';
	site += 1;
	mockSession = { site: { uuid: `site-${site}` }, store: { id: 1 } };
});

describe('useStoreCapability (test 12)', () => {
	it('reads the status capabilities with one GET per store session', async () => {
		mockGet.mockResolvedValue({ data: { capabilities: ['payments', 'tender_correction'] } });
		const first = renderHook(() => useStoreCapability('tender_correction'));
		await waitFor(() => expect(first.result.current).toBe(true));
		const second = renderHook(() => useStoreCapability('tender_correction'));
		await waitFor(() => expect(second.result.current).toBe(true));
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith('status');

		mockSession = { ...mockSession, store: { id: 2 } };
		mockGet.mockResolvedValue({ data: { capabilities: ['payments'] } });
		const other = renderHook(() => useStoreCapability('tender_correction'));
		await flush();
		expect(other.result.current).toBe(false);
		expect(mockGet).toHaveBeenCalledTimes(2);
	});

	// K3 (#3651): one mounted hook moved to another store whose answer has not come is hidden.
	it('is hidden at once when the session moves to another store that has not answered', async () => {
		mockGet.mockResolvedValueOnce({ data: { capabilities: ['tender_correction'] } });
		const { result, rerender } = renderHook(() => useStoreCapability('tender_correction'));
		await waitFor(() => expect(result.current).toBe(true));
		mockGet.mockReturnValue(new Promise(() => {}));
		mockSession = { ...mockSession, store: { id: 2 } };
		rerender();
		await flush();
		expect(result.current).toBe(false);
		expect(mockGet).toHaveBeenCalledTimes(2);
	});

	it('is hidden on a 404, and the 404 is kept for the session', async () => {
		mockGet.mockRejectedValue({ response: { status: 404 } });
		const { result } = renderHook(() => useStoreCapability('tender_correction'));
		await flush();
		expect(result.current).toBe(false);
		renderHook(() => useStoreCapability('tender_correction'));
		await flush();
		expect(mockGet).toHaveBeenCalledTimes(1);
	});

	it('is hidden on an error, and asks again on the next mount', async () => {
		mockGet.mockRejectedValueOnce(new Error('Network Error'));
		const { result } = renderHook(() => useStoreCapability('tender_correction'));
		await flush();
		expect(result.current).toBe(false);
		mockGet.mockResolvedValue({ data: { capabilities: ['tender_correction'] } });
		const again = renderHook(() => useStoreCapability('tender_correction'));
		await waitFor(() => expect(again.result.current).toBe(true));
		expect(mockGet).toHaveBeenCalledTimes(2);
	});

	it('is hidden on a missing list, and offline asks nothing', async () => {
		mockGet.mockResolvedValue({ data: {} });
		const { result } = renderHook(() => useStoreCapability('tender_correction'));
		await flush();
		expect(result.current).toBe(false);

		mockSession = { site: { uuid: 'offline-site' }, store: { id: 1 } };
		mockGet.mockClear();
		mockStatus = 'online-website-unavailable';
		const offline = renderHook(() => useStoreCapability('tender_correction'));
		await flush();
		expect(offline.result.current).toBe(false);
		expect(mockGet).not.toHaveBeenCalled();
	});
});
