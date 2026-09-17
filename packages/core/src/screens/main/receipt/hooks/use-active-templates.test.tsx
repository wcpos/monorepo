/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { of } from 'rxjs';

import { useActiveTemplates } from './use-active-templates';

const templates = [
	{ id: 'bound', type: 'closure', closure_store_id: 1, status: 'publish' },
	{ id: 'viewed', type: 'closure', closure_store_id: 2, status: 'publish' },
];
const collection = {
	find: ({ selector }: { selector: Record<string, unknown> }) => ({
		$: of(
			templates.filter((row) =>
				Object.entries(selector).every(([key, value]) => row[key as keyof typeof row] === value)
			)
		),
	}),
};
const session = {
	store: { id: 1, active_templates: [{ template_id: 'bound', sort_order: 0 }] },
	storeDB: { templates: collection },
};
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => session }));
jest.mock('../../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: true } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(row: T, select: (row: T) => unknown) => select(row),
}));
jest.mock('./use-templates-sync', () => ({ useTemplatesSync: jest.fn() }));

// Revert: query unscoped closure templates or filter by the bound store's assignments.
it('uses the viewed store template set instead of bound-store assignments', () => {
	const { result, rerender } = renderHook(({ storeId }) => useActiveTemplates('closure', storeId), {
		initialProps: { storeId: 2 },
	});
	expect(result.current.map((row) => row.id)).toEqual(['viewed']);
	rerender({ storeId: 3 });
	expect(result.current).toEqual([]);
});
