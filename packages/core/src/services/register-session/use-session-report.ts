import { useDocField } from '@wcpos/query';
import { PrinterService } from '@wcpos/printer';
import { log } from '@wcpos/utils/logger';
import type { ClosureDocument } from '@wcpos/database';

import { logDrawerOpened, logXReportPrinted, useRegisterActor } from './audit';
import { useRegisterSession } from './use-register-session';
import { buildClosureDocument, buildXReportDocument } from './closure-document';
import { useClosureDocumentContext } from './use-closure-document-context';
import { useReceiptDocument } from '../../screens/main/receipt/use-receipt-document';
import { useResolvedPrinter } from '../../screens/main/receipt/hooks/use-resolved-printer';

// Existing register-report printer selection, shared by the till and Reports.
const REPORT_TEMPLATE = { id: 'register-session', output_type: 'escpos', paper_width: null };

export function useSessionReport(closure?: ClosureDocument | null) {
	const actor = useRegisterActor();
	const { session, expected, blind, binding, movements, salesCount } = useRegisterSession();
	const snapshot = useDocField(closure, (row) => row);
	const { resolvedPrinter } = useResolvedPrinter({ template: REPORT_TEMPLATE });
	const context = useClosureDocumentContext();
	const localReport = snapshot
		? buildClosureDocument(snapshot, context)
		: session
			? buildXReportDocument(session, {
					...context,
					expected: blind ? {} : expected,
					breakdowns: {
						register_name: binding.registerName,
						opened_by_name:
							String(session.opened_by) === actor.id ? actor.name : String(session.opened_by ?? ''),
						movements,
						transaction_count: salesCount,
					},
				})
			: undefined;
	const report = useReceiptDocument({
		autoPrintAllowed: false,
		document: closure
			? `closure:${snapshot?.server_closure_id ?? closure.id}`
			: session
				? `xreport:${session.id}`
				: undefined,
		documentReady: closure
			? snapshot?.sync_status === 'synced' || snapshot?.sync_status === 'superseded'
			: !!session,
		localReport,
		templateType: 'closure',
		storeId: snapshot?.store_id ?? session?.store_id ?? undefined,
	});
	return {
		...report,
		doc: report,
		print: async () => {
			if ((await report.print()) !== true) throw new Error('Print was not dispatched');
			if (!closure)
				logXReportPrinted({
					actor,
					sessionId: session?.id,
					registerId: session?.register_id,
				});
			const at = new Date().toISOString();
			try {
				if (closure)
					await closure.incrementalModify((row) => ({
						...row,
						printed_at: row.printed_at ?? at,
						print_count: row.print_count + 1,
					}));
			} catch (error) {
				log.warn('Closure print marker write failed after dispatch', {
					context: { error: String(error) },
				});
			}
			return at;
		},
		openDrawer: async () => {
			if (resolvedPrinter?.autoOpenDrawer) {
				await new PrinterService().openDrawer(resolvedPrinter);
				logDrawerOpened({
					actor,
					sessionId: session?.id,
					registerId: session?.register_id,
				});
			}
		},
	};
}
