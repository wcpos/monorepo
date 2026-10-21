/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, type Observable, Subject } from 'rxjs';

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
let overrideStream: Observable<unknown[]> = overrides$;
const storeDB = {
	collections: { template_printer_overrides: { find: () => ({ $: overrideStream }) } },
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

const cloudPrinter = {
	id: 'cloud:reg-7',
	name: 'Kitchen Cloud',
	connectionType: 'cloud',
	columns: 48,
	isDefault: false,
	isBuiltIn: true,
	cloudPrinterId: 'reg-7',
} as unknown as PrinterProfile;
const systemPrinter = {
	id: 'system',
	name: 'Print Dialog',
	connectionType: 'system',
	columns: 42,
	isDefault: false,
	isBuiltIn: true,
} as unknown as PrinterProfile;

const loading = { printers: [], isLoading: true, cloudPending: true };
const loaded = { printers: [rawPrinter], isLoading: false, cloudPending: false };
const none = { printers: [], isLoading: false, cloudPending: false };

afterEach(() => {
	overrides$.next([]);
});

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

	it('gives no verdict while the overrides stream has not emitted, even with no printers', () => {
		// Printers loaded and empty would read as "will print its preview"; the overrides
		// are the other half of routing and must have answered too.
		overrideStream = new Subject<unknown[]>();
		try {
			mockAvailable.mockReturnValue(none);
			const { result } = renderHook(() => useResolvedPrinter({ template: thermalTemplate }));

			expect(result.current.isResolving).toBe(true);
			expect(result.current.mismatch).toBeNull();
		} finally {
			overrideStream = overrides$;
		}
	});

	it('warns once loading is done and no raw printer matched the thermal template', () => {
		mockAvailable.mockReturnValue(none);
		const { result } = renderHook(() => useResolvedPrinter({ template: thermalTemplate }));

		expect(result.current.isResolving).toBe(false);
		expect(result.current.mismatch).toBe('thermal-template-prints-preview');
	});
});

// The printers list stops waiting for the cloud request after a 2 s grace (isLoading false) so
// Settings never blanks on a hung request; routing must not treat that as "no cloud printers".
describe('useResolvedPrinter while the cloud-printer request is still pending', () => {
	// Past the grace: the list shows what it has, the cloud request has not answered yet.
	const graceExpired = (printers: PrinterProfile[]) => ({
		printers,
		isLoading: false,
		cloudPending: true,
	});

	it('keeps resolving until a cloud printer the template is routed to arrives', () => {
		overrides$.next([{ template_id: '7', printer_profile_id: 'cloud:reg-7' }]);
		mockAvailable.mockReturnValue(graceExpired([systemPrinter]));
		const { result, rerender } = renderHook(() =>
			useResolvedPrinter({ template: thermalTemplate })
		);

		expect(result.current.resolvedPrinter).toBeNull();
		expect(result.current.isResolving).toBe(true);
		expect(result.current.mismatch).toBeNull();

		mockAvailable.mockReturnValue({
			printers: [systemPrinter, cloudPrinter],
			isLoading: false,
			cloudPending: false,
		});
		rerender();

		expect(result.current.isResolving).toBe(false);
		expect(result.current.resolvedPrinter?.id).toBe('cloud:reg-7');
	});

	it('keeps resolving when a local printer matches but the override names a cloud one', () => {
		// Auto-match would hand the job to the local printer; the override says the cloud one.
		overrides$.next([{ template_id: '7', printer_profile_id: 'cloud:reg-7' }]);
		mockAvailable.mockReturnValue(graceExpired([rawPrinter, systemPrinter]));
		const { result, rerender } = renderHook(() =>
			useResolvedPrinter({ template: thermalTemplate })
		);

		expect(result.current.isResolving).toBe(true);

		mockAvailable.mockReturnValue({
			printers: [rawPrinter, systemPrinter, cloudPrinter],
			isLoading: false,
			cloudPending: false,
		});
		rerender();

		expect(result.current.isResolving).toBe(false);
		expect(result.current.resolvedPrinter?.id).toBe('cloud:reg-7');
	});

	it('proceeds at once when a local printer already matched', () => {
		mockAvailable.mockReturnValue(graceExpired([rawPrinter, systemPrinter]));
		const { result } = renderHook(() => useResolvedPrinter({ template: thermalTemplate }));

		expect(result.current.isResolving).toBe(false);
		expect(result.current.resolvedPrinter?.id).toBe('p1');
	});

	it('proceeds at once with the print dialog selected', () => {
		mockAvailable.mockReturnValue(graceExpired([systemPrinter]));
		const { result } = renderHook(() => useResolvedPrinter({ template: thermalTemplate }));

		act(() => {
			result.current.setPrinterSelection({ type: 'system' });
		});

		expect(result.current.isResolving).toBe(false);
		expect(result.current.useSystemDialog).toBe(true);
	});
});
