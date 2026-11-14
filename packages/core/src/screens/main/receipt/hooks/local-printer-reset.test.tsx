/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useResolvedPrinter } from './use-resolved-printer';

const profiles = [
	{ id: 'before', columns: 42 },
	{ id: 'after', columns: 42 },
];
const storeDB = {};
const overrides$ = new BehaviorSubject([{ template_id: 'receipt', printer_profile_id: 'before' }]);
const mockObserveOverrides = jest.fn((_database: unknown) => overrides$);
jest.mock('@wcpos/query', () => ({
	observeTemplatePrinterOverrides: (database: unknown) => mockObserveOverrides(database),
}));
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({ storeDB }) }));
jest.mock('../../settings/printer/use-available-printer-profiles', () => ({
	useAvailablePrinterProfiles: () => ({ printers: profiles }),
}));
jest.mock('@wcpos/printer', () => ({
	resolvePrinter: jest.requireActual('@wcpos/printer/resolve-printer').resolvePrinter,
	detectMismatch: () => null,
}));

it('routes using updated overrides from the named read', () => {
	const { result } = renderHook(() =>
		useResolvedPrinter({
			template: { id: 'receipt', output_type: 'escpos', paper_width: '80mm' },
		})
	);
	expect(result.current.resolvedPrinter?.id).toBe('before');
	act(() => overrides$.next([{ template_id: 'receipt', printer_profile_id: 'after' }]));
	expect(result.current.resolvedPrinter?.id).toBe('after');
	expect(mockObserveOverrides).toHaveBeenCalledWith(storeDB);
});
