/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useRegisterHealth } from './use-register-health';

const mockGet = jest.fn();
let mockClient = { get: mockGet };
jest.mock('../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockClient,
}));
let mockSession = { site: { uuid: 'site-a' }, store: { id: 1 } };
jest.mock('../../../contexts/app-state', () => ({ useStoreSession: () => mockSession }));
const data = { window_days: 30, skew_seconds: 600, registers: [], unregistered: [] };

beforeEach(() => {
	mockGet.mockReset();
	mockClient = { get: mockGet };
	mockSession = { site: { uuid: 'site-a' }, store: { id: 1 } };
});

it('fetches health once on mount and exposes the resolved data', async () => {
	mockGet.mockResolvedValue({ data });
	const { result, rerender } = renderHook(() => useRegisterHealth());
	expect(result.current.loading).toBe(true);
	await waitFor(() => expect(result.current.data).toEqual(data));
	expect(result.current.loading).toBe(false);
	expect(result.current.error).toBeNull();
	rerender();
	expect(mockGet).toHaveBeenCalledTimes(1);
	expect(mockGet).toHaveBeenCalledWith('registers/health');
});

it('maps a rejected fetch to an error instead of throwing', async () => {
	mockGet.mockRejectedValue(new Error('Store unavailable'));
	const { result } = renderHook(() => useRegisterHealth());
	await waitFor(() => expect(result.current.loading).toBe(false));
	expect(result.current.error).toBe('Store unavailable');
	expect(result.current.data).toBeNull();
});

it('refresh fetches again and replaces data', async () => {
	mockGet.mockResolvedValueOnce({ data });
	const { result } = renderHook(() => useRegisterHealth());
	await waitFor(() => expect(result.current.loading).toBe(false));
	const updated = { ...data, window_days: 14 };
	mockGet.mockResolvedValueOnce({ data: updated });
	await act(async () => {
		await result.current.refresh();
	});
	expect(mockGet).toHaveBeenCalledTimes(2);
	expect(result.current.data).toEqual(updated);
	expect(result.current.error).toBeNull();
});

it('refresh can recover from an error', async () => {
	mockGet.mockRejectedValueOnce(new Error('Offline'));
	const { result } = renderHook(() => useRegisterHealth());
	await waitFor(() => expect(result.current.error).toBe('Offline'));
	mockGet.mockResolvedValueOnce({ data });
	await act(async () => {
		await result.current.refresh();
	});
	expect(result.current.data).toEqual(data);
	expect(result.current.error).toBeNull();
});

it('keeps the loaded results visible when a refresh fails', async () => {
	mockGet.mockResolvedValueOnce({ data });
	const { result } = renderHook(() => useRegisterHealth());
	await waitFor(() => expect(result.current.data).toEqual(data));
	mockGet.mockRejectedValueOnce(new Error('Store unavailable'));
	await act(async () => {
		await result.current.refresh();
	});
	expect(result.current.data).toEqual(data);
	expect(result.current.error).toBe('Store unavailable');
	expect(result.current.loading).toBe(false);
});

it('a store switch (new client) clears the previous findings and fetches again', async () => {
	mockGet.mockResolvedValueOnce({ data });
	const { result, rerender } = renderHook(() => useRegisterHealth());
	await waitFor(() => expect(result.current.data).toEqual(data));
	const other = { ...data, window_days: 7 };
	mockGet.mockResolvedValueOnce({ data: other });
	mockClient = { get: mockGet };
	mockSession = { site: { uuid: 'site-a' }, store: { id: 2 } };
	rerender();
	expect(result.current.data).toBeNull();
	expect(result.current.loading).toBe(true);
	await waitFor(() => expect(result.current.data).toEqual(other));
	expect(mockGet).toHaveBeenCalledTimes(2);
});

it('a same-store client change (connectivity) re-fetches but keeps the loaded findings', async () => {
	mockGet.mockResolvedValueOnce({ data });
	const { result, rerender } = renderHook(() => useRegisterHealth());
	await waitFor(() => expect(result.current.data).toEqual(data));
	mockGet.mockRejectedValueOnce(new Error('Offline'));
	mockClient = { get: mockGet };
	rerender();
	expect(result.current.data).toEqual(data);
	await waitFor(() => expect(result.current.error).toBe('Offline'));
	expect(result.current.data).toEqual(data);
	expect(mockGet).toHaveBeenCalledTimes(2);
});
