import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { PrinterProfile, PrintMismatch, TemplateInfo } from '@wcpos/printer';
import { detectMismatch, resolvePrinter } from '@wcpos/printer';
import type { TemplatePrinterOverrideDocument } from '@wcpos/database';

import { useAvailablePrinterProfiles } from '../../settings/printer/use-available-printer-profiles';
import { useStoreSession } from '../../../../contexts/app-state';

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
	mismatch: PrintMismatch | null;
	useSystemDialog: boolean;
	/** Printers or routing overrides are still loading: `resolvedPrinter` may yet change. */
	isResolving: boolean;
}

export function useResolvedPrinter({
	template,
}: UseResolvedPrinterOptions): UseResolvedPrinterResult {
	const { storeDB } = useStoreSession();
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

	const {
		printers: allPrinters,
		isLoading: printersLoading,
		cloudPending,
	} = useAvailablePrinterProfiles();

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
	const loadedOverrides = useObservableState<Map<string, string> | undefined>(
		overrides$,
		undefined
	);
	const overrides = React.useMemo(
		() => loadedOverrides ?? new Map<string, string>(),
		[loadedOverrides]
	);

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

	// Two readiness notions: `printersLoading` clears after a 2 s grace so Settings never blanks on
	// a hung cloud request, but routing must not read that as "no cloud printers". While the cloud
	// request is still out, keep resolving if nothing matched yet or the template's override names
	// a printer not in the list yet (it may be a cloud one); a local match proceeds at once.
	const overrideId = template ? overrides.get(String(template.id)) : undefined;
	const awaitingCloud =
		cloudPending &&
		printerSelection.type !== 'system' &&
		(resolvedPrinter === null ||
			(printerSelection.type === 'auto' &&
				overrideId !== undefined &&
				!allPrinters.some((p) => p.id === overrideId)));
	const isResolving = printersLoading || loadedOverrides === undefined || awaitingCloud;

	// What will actually print, given the profile usePrint receives. The 'system' selection and
	// an auto match that found nothing both leave resolvedPrinter null: the print dialog path.
	// While printers or overrides are still loading, null is only "not loaded yet", so no verdict.
	const mismatch = React.useMemo(() => {
		if (!template || isResolving) return null;
		return detectMismatch(template, resolvedPrinter);
	}, [template, resolvedPrinter, isResolving]);

	return {
		allPrinters,
		resolvedPrinter,
		printerSelection,
		setPrinterSelection,
		mismatch,
		useSystemDialog,
		isResolving,
	};
}
