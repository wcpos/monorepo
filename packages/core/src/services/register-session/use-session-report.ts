import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useDocField } from '@wcpos/query';
import { PrinterService } from '@wcpos/printer';
import type { ClosureDocument, ClosureRow, WPCredentialsDocument } from '@wcpos/database';

import { useStoreSession } from '../../contexts/app-state';
import { logDrawerOpened, logXReportPrinted, useRegisterActor } from './audit';
import { useClosureCollection } from './use-register-session-collections';
import { useRegisterSession } from './use-register-session';
import { buildClosureDocument, buildXReportDocument } from './closure-document';
import { useClosureDocumentContext } from './use-closure-document-context';
import { useReceiptDocument } from '../../screens/main/receipt/use-receipt-document';
import { useResolvedPrinter } from '../../screens/main/receipt/hooks/use-resolved-printer';

// Existing register-report printer selection, shared by the till and Reports.
const REPORT_TEMPLATE = { id: 'register-session', output_type: 'escpos', paper_width: null };

export function useSessionReport(
	closure?: ClosureDocument | null,
	isReprint = false,
	knownClosure?: ClosureRow
) {
	const actor = useRegisterActor();
	const { site } = useStoreSession();
	const source = React.useMemo(() => site.populate$('wp_credentials'), [site]);
	const cashiers = useObservableState(source, []) as WPCredentialsDocument[];
	const { session, expected, blind, binding, movements, salesCount } = useRegisterSession();
	const snapshot = useDocField(closure, (row) => row) ?? knownClosure;
	const collection = useClosureCollection();
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
							String(session.opened_by) === actor.id
								? actor.name
								: (cashiers.find((row) => row.id === session.opened_by)?.display_name ??
									String(session.opened_by ?? '')),
						movements,
						transaction_count: salesCount,
					},
				})
			: undefined;
	const report = useReceiptDocument({
		autoPrintAllowed: false,
		isReprint,
		getLocalClosure: snapshot
			? async () => closure ?? (await collection?.findOne(snapshot.id).exec()) ?? null
			: undefined,
		document: snapshot
			? `closure:${snapshot.server_closure_id ?? snapshot.id}`
			: session
				? `xreport:${session.id}`
				: undefined,
		documentReady: snapshot
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
			if ((await report.print()) !== true) throw new Error('reports.reprint_failed');
			if (!snapshot)
				logXReportPrinted({
					actor,
					sessionId: session?.id,
					registerId: session?.register_id,
				});
			const at = new Date().toISOString();
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
