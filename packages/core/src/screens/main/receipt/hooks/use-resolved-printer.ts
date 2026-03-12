import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { PrinterProfile, TemplateInfo } from '@wcpos/printer';
import { detectMismatch, resolvePrinter } from '@wcpos/printer';
import type { PrinterProfileDocument, TemplatePrinterOverrideDocument } from '@wcpos/database';

import { toPrinterProfile } from '../../settings/printer/use-default-printer-profile';
import { useAppState } from '../../../../contexts/app-state';

interface UseResolvedPrinterOptions {
	template: TemplateInfo | null;
}

interface UseResolvedPrinterResult {
	allPrinters: PrinterProfile[];
	resolvedPrinter: PrinterProfile | null;
	manualPrinterId: string | null;
	setManualPrinterId: (id: string | null) => void;
	mismatchWarning: string | null;
}

export function useResolvedPrinter({
	template,
}: UseResolvedPrinterOptions): UseResolvedPrinterResult {
	const { storeDB } = useAppState();
	const [manualPrinterId, setManualPrinterId] = React.useState<string | null>(null);

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

	// Reset manual selection when template changes
	React.useEffect(() => {
		setManualPrinterId(null);
	}, [template?.id]);

	// Resolve printer
	const resolvedPrinter = React.useMemo(() => {
		if (!template) return null;
		return resolvePrinter({
			template,
			overrides,
			profiles: allPrinters,
			manualPrinterId: manualPrinterId ?? undefined,
		});
	}, [template, overrides, allPrinters, manualPrinterId]);

	// Mismatch detection
	const mismatchWarning = React.useMemo(() => {
		if (!template) return null;
		return detectMismatch(template, resolvedPrinter);
	}, [template, resolvedPrinter]);

	return {
		allPrinters,
		resolvedPrinter,
		manualPrinterId,
		setManualPrinterId,
		mismatchWarning,
	};
}
