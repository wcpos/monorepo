import { useDocField } from '@wcpos/query';
import { PrinterService } from '@wcpos/printer';
import { log } from '@wcpos/utils/logger';
import type { ClosureDocument, ClosureRow } from '@wcpos/database';

import { logDrawerOpened, logXReportPrinted, useRegisterActor } from './audit';
import { useRegisterSession } from './use-register-session';
import { useT } from '../../contexts/translations';
import { useReceiptDocument } from '../../screens/main/receipt/use-receipt-document';
import { useResolvedPrinter } from '../../screens/main/receipt/hooks/use-resolved-printer';
import { useCurrencyFormat } from '../../screens/main/hooks/use-currency-format';

// Existing register-report printer selection, shared by the till and Reports.
const REPORT_TEMPLATE = { id: 'register-session', output_type: 'escpos', paper_width: null };

export function useSessionReport(closure?: ClosureDocument | null) {
	const actor = useRegisterActor();
	const { session, expected, blind, binding } = useRegisterSession();
	const snapshot = useDocField(closure, (row) => row);
	const { resolvedPrinter } = useResolvedPrinter({ template: REPORT_TEMPLATE });
	const t = useT();
	const { format } = useCurrencyFormat();
	const formatReport = (data: Record<string, unknown> = {}) => {
		const row = (data.closure ?? snapshot) as Partial<ClosureRow> | undefined;
		const figures = closure
			? {
					[t('register.counted')]: row?.counted?.cash,
					[t('register.expected', { amount: '' }).trim()]:
						row?.expected?.cash ?? row?.till_expected?.cash,
					[t('register.variance')]: row?.variance?.cash,
					[t('register.period_sales')]: row?.period_sales_total,
					[t('register.period_refunds')]: row?.period_refunds_total,
					[t('register.perpetual_sales')]: row?.perpetual_sales_total,
					[t('register.perpetual_refunds')]: row?.perpetual_refunds_total,
				}
			: blind
				? {}
				: (row?.expected ?? expected);
		const fiscal = data.fiscal as { is_reprint?: boolean; receipt_number?: string } | undefined;
		const footer = [
			(fiscal?.is_reprint ?? !!snapshot?.print_count) ? t('register.reprint_copy') : '',
			row?.unsynced_count ? t('register.unsynced_closure', { count: row.unsynced_count }) : '',
		]
			.filter(Boolean)
			.join(' · ');
		const title = t(closure ? 'register.z_report' : 'register.x_report');
		const order_number = `${title} ${fiscal?.receipt_number ?? row?.server_number ?? row?.printed_number ?? row?.number ?? session?.id ?? ''}`;
		const line_items = Object.entries(figures).map(([name, total]) => ({
			name,
			quantity: 1,
			total,
			amount: format(Number(total ?? 0)),
		}));
		return {
			...data,
			closure: row,
			title,
			store: { name: binding.registerName },
			order_number,
			date_created: row?.closed_at ?? session?.opened_at_gmt,
			line_items,
			lines: line_items.map((line) => ({ name: `${line.name}: ${line.amount}`, qty: 1 })),
			footer,
			customer_note: footer,
			// The thermal report template reads order.number and order.customer_note.
			order: { ...(data.order as object | undefined), number: order_number, customer_note: footer },
		};
	};
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
		localReport: formatReport(),
		formatReport,
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
