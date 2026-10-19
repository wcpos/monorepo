/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useCollectionReset } from './use-collection-reset';

const engine = {};
const resetCollectionsAndRefill = jest.fn();
const warn = jest.fn();
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine }),
	resetCollectionsAndRefill: (...args: unknown[]) => resetCollectionsAndRefill(...args),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ debug: jest.fn(), warn: (...args: unknown[]) => warn(...args) }),
}));

beforeEach(() => {
	resetCollectionsAndRefill.mockReset().mockResolvedValue('reset');
	warn.mockClear();
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
});

it('warns when the command refuses to destroy pending changes', async () => {
	resetCollectionsAndRefill.mockResolvedValue('needs-confirmation');
	const { result } = renderHook(() => useCollectionReset('customers'));
	await result.current.clearAndSync();
	expect(warn).toHaveBeenCalledWith('clearAndSync: reset needs confirmation', {
		context: { collectionName: 'customers' },
	});
});
