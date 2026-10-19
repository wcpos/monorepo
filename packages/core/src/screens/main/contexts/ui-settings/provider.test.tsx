/** @jest-environment jsdom */
import * as React from 'react';

import { act, renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { UISettingsContext, UISettingsProvider } from './provider';
import { useUISettings } from './use-ui-settings';

const mockStoreDB = {};
const mockOpenStoreState = jest.fn();
jest.mock('@wcpos/query/store-local', () => ({
	openStoreState: (...args: unknown[]) => mockOpenStoreState(...args),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockStoreDB }),
}));
jest.mock('./use-ui-label', () => ({ useUILabel: () => ({ getLabel: jest.fn() }) }));
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

beforeEach(() => {
	jest.clearAllMocks();
	jest.useFakeTimers();
});
afterEach(() => {
	jest.clearAllTimers();
	jest.useRealTimers();
});

it('surfaces the rejected open without later reporting a possible hang', async () => {
	const error = new Error('state storage failed');
	mockOpenStoreState.mockRejectedValue(error);
	const { result } = renderHook(() => React.useContext(UISettingsContext), {
		wrapper: UISettingsProvider,
	});
	await act(async () => {});

	for (const resource of Object.values(result.current!.resources)) {
		expect(() => resource.read()).toThrow(error);
	}
	act(() => jest.advanceTimersByTime(5000));
	expect(getLogger(['wcpos', 'ui', 'settings']).warn).not.toHaveBeenCalled();
});

it('keeps the hang warning for an open that is still pending', () => {
	mockOpenStoreState.mockReturnValue(new Promise(() => {}));
	renderHook(() => React.useContext(UISettingsContext), { wrapper: UISettingsProvider });
	act(() => jest.advanceTimersByTime(5000));
	expect(getLogger(['wcpos', 'ui', 'settings']).warn).toHaveBeenCalledWith(
		expect.stringContaining('possible hang')
	);
});

it('opens the screen slot for initial reads, patchUI and resetUI', async () => {
	const slots = new Map<
		string,
		{
			get: () => Record<string, unknown>;
			set: (path: string, modifier: (value: unknown) => unknown) => Promise<void>;
		}
	>();
	mockOpenStoreState.mockImplementation(async (_db: unknown, key: string) => {
		if (!slots.has(key)) {
			const data: Record<string, unknown> = {};
			slots.set(key, {
				get: () => data,
				set: async (path: string, modifier: (value: unknown) => unknown) => {
					data[path] = modifier(data[path]);
				},
			});
		}
		return slots.get(key);
	});
	const { result } = renderHook(() => useUISettings('products'), {
		wrapper: ({ children }) => (
			<UISettingsProvider>
				<React.Suspense fallback={null}>{children}</React.Suspense>
			</UISettingsProvider>
		),
	});
	await act(async () => {});
	expect(result.current.uiSettings).toBe(slots.get('products_v2'));
	expect(result.current.uiSettings.get().sortBy).toBe('name');
	await act(async () => {
		await result.current.patchUI({ sortBy: 'price' });
	});
	expect(result.current.uiSettings.get().sortBy).toBe('price');
	await act(async () => {
		await result.current.resetUI();
	});
	expect(result.current.uiSettings.get().sortBy).toBe('name');
	expect(mockOpenStoreState).toHaveBeenLastCalledWith(mockStoreDB, 'products_v2');
	act(() => jest.advanceTimersByTime(5000));
	expect(getLogger(['wcpos', 'ui', 'settings']).warn).not.toHaveBeenCalled();
});
