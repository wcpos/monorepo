/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { PrinterProfile, TemplateInfo } from '@wcpos/printer';

import { useResolvedPrinter } from './use-resolved-printer';

// The printer package root pulls the ESC/POS encoder in, which jsdom cannot load; the hook
// needs only the two pure predicates, so take them from their own modules.
jest.mock('@wcpos/printer', () => ({
	detectMismatch: jest.requireActual('@wcpos/printer/detect-mismatch').detectMismatch,
	resolvePrinter: jest.requireActual('@wcpos/printer/resolve-printer').resolvePrinter,
}));

const mockAvailable = jest.fn();
jest.mock('../../settings/printer/use-available-printer-profiles', () => ({
	useAvailablePrinterProfiles: () => mockAvailable(),
}));

// One stable storeDB: the hook memoises its overrides stream on it, and a fresh object per
// render would resubscribe every render.
const overrides$ = new BehaviorSubject<unknown[]>([]);
const storeDB = {
	collections: { template_printer_overrides: { find: () => ({ $: overrides$ }) } },
};
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB }),
}));

const thermalTemplate: TemplateInfo = { id: 7, output_type: 'escpos', paper_width: '80mm' };
const rawPrinter = {
	id: 'p1',
	name: 'Till printer',
	connectionType: 'network',
	columns: 48,
	isDefault: true,
} as unknown as PrinterProfile;

const loading = { printers: [], isLoading: true };
const loaded = { printers: [rawPrinter], isLoading: false };
const none = { printers: [], isLoading: false };

describe('useResolvedPrinter mismatch', () => {
	it('gives no verdict while printers are still loading, then judges the resolved printer', () => {
		// The badge used to flash "will print its preview" on every receipt open: the first
		// render sees no printers yet, which reads exactly like a store with none.
		mockAvailable.mockReturnValue(loading);
		const { result, rerender } = renderHook(() =>
			useResolvedPrinter({ template: thermalTemplate })
		);

		expect(result.current.isResolving).toBe(true);
		expect(result.current.mismatch).toBeNull();

		mockAvailable.mockReturnValue(loaded);
		rerender();

		expect(result.current.isResolving).toBe(false);
		expect(result.current.resolvedPrinter?.id).toBe('p1');
		expect(result.current.mismatch).toBeNull();
	});

	it('warns once loading is done and no raw printer matched the thermal template', () => {
		mockAvailable.mockReturnValue(none);
		const { result } = renderHook(() => useResolvedPrinter({ template: thermalTemplate }));

		expect(result.current.isResolving).toBe(false);
		expect(result.current.mismatch).toBe('thermal-template-prints-preview');
	});
});
