/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { of, Subject } from 'rxjs';

import { useActiveTemplates } from './use-active-templates';

const templates = [
	{ id: 'bound', type: 'closure', closure_store_id: 1, status: 'publish' },
	{ id: 'viewed', type: 'closure', closure_store_id: 2, status: 'publish' },
];
const session = {
	store: { id: 1, active_templates: [{ template_id: 'bound', sort_order: 0 }] },
	storeDB: {},
};
const mockObserveActiveTemplates = jest.fn((_database: unknown, { storeId }: { storeId: number }) =>
	of(templates.filter((row) => row.closure_store_id === storeId))
);
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => session }));
jest.mock('../../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: true } }),
}));
jest.mock('@wcpos/query', () => ({
	observeActiveTemplates: (...args: Parameters<typeof mockObserveActiveTemplates>) =>
		mockObserveActiveTemplates(...args),
	useDocField: <T,>(row: T, select: (row: T) => unknown) => select(row),
}));
jest.mock('./use-templates-sync', () => ({ useTemplatesSync: jest.fn(() => ({ synced: true })) }));

// Revert: query unscoped closure templates or filter by the bound store's assignments.
it('uses the viewed store template set instead of bound-store assignments', () => {
	const { result, rerender } = renderHook(({ storeId }) => useActiveTemplates('closure', storeId), {
		initialProps: { storeId: 2 },
	});
	expect(result.current.map((row) => row.id)).toEqual(['viewed']);
	rerender({ storeId: 3 });
	expect(result.current).toEqual([]);
});

it('renders updated rows from the named read', () => {
	const rows$ = new Subject<typeof templates>();
	mockObserveActiveTemplates.mockReturnValueOnce(rows$);
	const { result } = renderHook(() => useActiveTemplates('closure', 2));
	act(() => rows$.next([{ ...templates[1], id: 'replacement' }]));
	expect(result.current.map((row) => row.id)).toEqual(['replacement']);
	expect(mockObserveActiveTemplates).toHaveBeenLastCalledWith(session.storeDB, {
		type: 'closure',
		storeId: 2,
	});
});
