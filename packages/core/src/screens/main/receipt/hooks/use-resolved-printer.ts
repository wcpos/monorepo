import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { PrinterProfile, TemplateInfo } from '@wcpos/printer';
import { detectMismatch, resolvePrinter } from '@wcpos/printer';
import type { TemplatePrinterOverrideDocument } from '@wcpos/database';

import { useAvailablePrinterProfiles } from '../../settings/printer/use-available-printer-profiles';
import { useAppState } from '../../../../contexts/app-state';

export type PrinterSelection =
	{ type: 'auto' } | { type: 'system' } | { type: 'manual'; printerId: string };

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
	// Track the user's explicit selection together with the template it was made
	// for. When the template changes the selection resets to 'auto' - this is
	// derived during render rather than reset via an effect.
	const [pick, setPick] = React.useState<{
		templateId: string | number | undefined;
		selection: PrinterSelection;
	}>({ templateId: template?.id, selection: { type: 'auto' } });

	const setPrinterSelection = React.useCallback(
		(selection: PrinterSelection) => {
			setPick({ templateId: template?.id, selection });
		},
		[template?.id]
	);

	const printerSelection = React.useMemo<PrinterSelection>(
		() => (pick.templateId === template?.id ? pick.selection : { type: 'auto' }),
		[pick, template?.id]
	);

	const allPrinters = useAvailablePrinterProfiles();

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
