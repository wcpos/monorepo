import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { PrinterProfile, TemplateInfo } from '@wcpos/printer';
import { detectMismatch, resolvePrinter } from '@wcpos/printer';
import type { PrinterProfileDocument, TemplatePrinterOverrideDocument } from '@wcpos/database';

import { toPrinterProfile } from '../../settings/printer/use-default-printer-profile';
import { useAppState } from '../../../../contexts/app-state';

export type PrinterSelection =
	| { type: 'auto' }
	| { type: 'system' }
	| { type: 'manual'; printerId: string };

interface UseResolvedPrinterOptions {
	template: TemplateInfo | null;
}

interface UseResolvedPrinterResult {
	allPrinters: PrinterProfile[];
	resolvedPrinter: PrinterProfile | null;
	printerSelection: PrinterSelection;
	setPrinterSelection: (selection: PrinterSelection) => void;
	mismatchWarning: string | null;
	useSystemDialog: boolean;
}

export function useResolvedPrinter({
	template,
}: UseResolvedPrinterOptions): UseResolvedPrinterResult {
	const { storeDB } = useAppState();
	const [printerSelection, setPrinterSelection] = React.useState<PrinterSelection>({
		type: 'auto',
	});

	// Subscribe to all printer profiles
	const profiles$ = React.useMemo(
		() =>
			storeDB.collections.printer_profiles
				.find()
				.$.pipe(map((docs) => (docs as PrinterProfileDocument[]).map(toPrinterProfile))),
		[storeDB]
	);
	const allPrinters = useObservableState(profiles$, []);

	// Subscribe to all overrides
	const overrides$ = React.useMemo(
		() =>
			storeDB.collections.template_printer_overrides.find().$.pipe(
				map((docs) => {
					const m = new Map<string, string>();
					for (const doc of docs as TemplatePrinterOverrideDocument[]) {
						m.set(doc.template_id, doc.printer_profile_id);
					}
					return m;
				})
			),
		[storeDB]
	);
	const overrides = useObservableState(overrides$, new Map<string, string>());

	// Reset selection when template changes
	React.useEffect(() => {
		setPrinterSelection({ type: 'auto' });
	}, [template?.id]);

	// Resolve printer based on selection type
	const resolvedPrinter = React.useMemo(() => {
		if (!template) return null;

		if (printerSelection.type === 'system') {
			return null;
		}

		if (printerSelection.type === 'manual') {
			return allPrinters.find((p) => p.id === printerSelection.printerId) ?? null;
		}

		// auto: use routing resolution
		return resolvePrinter({
			template,
			overrides,
			profiles: allPrinters,
		});
	}, [template, overrides, allPrinters, printerSelection]);

	// Whether to use system dialog (no printer profile)
	const useSystemDialog = printerSelection.type === 'system';

	// Mismatch detection (only relevant for auto/manual, not system dialog)
	const mismatchWarning = React.useMemo(() => {
		if (!template) return null;
		if (printerSelection.type === 'system') return null;
		return detectMismatch(template, resolvedPrinter);
	}, [template, resolvedPrinter, printerSelection.type]);

	return {
		allPrinters,
		resolvedPrinter,
		printerSelection,
		setPrinterSelection,
		mismatchWarning,
		useSystemDialog,
	};
}
