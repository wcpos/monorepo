/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useCollectionReset } from './use-collection-reset';

const engine = {};
const resetCollectionsAndRefill = jest.fn();
const debug = jest.fn();
const warn = jest.fn();
const mockToastShow = jest.fn();
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine }),
	resetCollectionsAndRefill: (...args: unknown[]) => resetCollectionsAndRefill(...args),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: (...args: unknown[]) => debug(...args),
		warn: (...args: unknown[]) => warn(...args),
	}),
}));
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

beforeEach(() => {
	resetCollectionsAndRefill.mockReset().mockResolvedValue('reset');
	debug.mockClear();
	warn.mockClear();
	mockToastShow.mockClear();
});

it.each([
	['products', 'products'],
	['products/categories', 'categories'],
	['taxes', 'taxRates'],
] as const)('resets and refills %s through the query command', async (key, engineName) => {
	const { result } = renderHook(() => useCollectionReset(key));
	await result.current.clearAndSync();
	expect(resetCollectionsAndRefill).toHaveBeenCalledWith(engine, engineName);
	expect(warn).not.toHaveBeenCalled();
	// Clears and refills silently when nothing is waiting to be sent.
	expect(mockToastShow).not.toHaveBeenCalled();
});

it('tells the cashier why "Clear and sync" did nothing when unsent changes would be lost', async () => {
	resetCollectionsAndRefill.mockResolvedValue('needs-confirmation');
	const { result } = renderHook(() => useCollectionReset('customers'));
	await result.current.clearAndSync();
	// Never cleared — the engine's own row records it, so this one is forensic —
	// but no longer a dead button.
	expect(debug).toHaveBeenCalledWith('clearAndSync: reset needs confirmation', {
		context: { collectionName: 'customers' },
	});
	expect(warn).not.toHaveBeenCalled();
	expect(mockToastShow).toHaveBeenCalledWith({
		type: 'warning',
		title: 'common.clear_blocked_unsent',
		description: 'common.clear_blocked_unsent_hint',
	});
});
