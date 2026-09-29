import type { cashiers, categories, taxesByRate, tenders, topProducts } from '../cards/aggregate';
import type { DetailId, ReportOrder } from '../context';
import type { calculateTotals } from '../report/utils';
import type { useReportFormats } from '../use-report-formats';

export type PanelSpec = {
	head: string[];
	rows: { key: string | number; cells: string[] }[];
	total?: string[];
	align: ('left' | 'right')[];
};
type Inputs = {
	payments: ReturnType<typeof tenders>;
	products: ReturnType<typeof topProducts>;
	categories: ReturnType<typeof categories>;
	cashiers: ReturnType<typeof cashiers>;
	taxes: ReturnType<typeof taxesByRate>;
	orders: ReportOrder[];
	totals: ReturnType<typeof calculateTotals>;
	cashierNames: Record<string, string>;
	formats: Pick<ReturnType<typeof useReportFormats>, 'money' | 'number' | 'quantity' | 'percent'>;
	t: (key: string, values?: Record<string, unknown>) => string;
};
export function panelSpec(id: Exclude<DetailId, 'orders'>, inputs: Inputs): PanelSpec {
	const {
		payments,
		products,
		categories,
		cashiers,
		taxes,
		orders,
		totals,
		cashierNames,
		formats,
		t,
	} = inputs;
	const { money, number, quantity, percent } = formats;
	const share = (value: number) => t('reports.percent', { value: percent(value * 100) });
	const unknown = t('common.unknown'),
		total = t('common.total');
	const count = number(orders.length),
		amount = money(totals.total);
	const spec = (head: string[], rows: PanelSpec['rows'], total?: string[]): PanelSpec => ({
		head: head.map((key) => t(key)),
		rows,
		total,
		align: head.map((_, index) => (index === 0 ? 'left' : 'right')),
	});
	switch (id) {
		case 'payments': {
			const labels: Record<string, string> = {
				cash: t('common.cash'),
				unpaid: t('reports.unpaid'),
				unknown,
			};
			return spec(
				['reports.col_method', 'common.orders', 'common.amount', 'reports.col_share'],
				payments.map((row) => ({
					key: row.key,
					cells: [
						row.label || labels[row.key] || unknown,
						number(row.orders),
						money(row.amount),
						share(row.share),
					],
				})),
				[total, count, amount, '']
			);
		}
		case 'products':
			return spec(
				['common.product', 'reports.col_qty', 'common.amount'],
				products.map((row) => ({
					key: row.key,
					cells: [row.name || unknown, quantity(row.quantity), money(row.amount)],
				})),
				// The rows carry line totals; the order total would add shipping and fees they do not.
				[
					t('reports.all_products'),
					quantity(totals.totalItemsSold),
					money(products.reduce((sum, row) => sum + row.amount, 0)),
				]
			);
		case 'categories': {
			const labels: Record<string, string> = {
				unknown: t('reports.unknown_product'),
				uncategorised: t('reports.uncategorised'),
			};
			return spec(
				['common.category', 'reports.col_qty', 'common.amount', 'reports.col_share'],
				categories.parts.map((row) => ({
					key: row.key,
					cells: [
						row.label || labels[row.key] || unknown,
						quantity(row.quantity),
						money(row.amount),
						share(row.share),
					],
				})),
				[
					total,
					quantity(totals.totalItemsSold),
					money(categories.parts.reduce((sum, row) => sum + row.amount, 0)),
					'',
				]
			);
		}
		case 'cashiers':
			return spec(
				['common.cashier', 'common.orders', 'reports.col_avg_order', 'common.amount'],
				cashiers.map((row) => ({
					key: row.key,
					cells: [
						cashierNames[row.key] || unknown,
						number(row.orders),
						money(row.orders ? row.amount / row.orders : 0),
						money(row.amount),
					],
				})),
				[total, count, money(totals.averageOrderValue), amount]
			);
		case 'taxes':
			return spec(
				['common.rate', 'reports.document.net', 'common.tax', 'reports.document.gross'],
				taxes.rows.map((row) => ({
					key: row.rateId,
					cells: [
						row.label || unknown,
						row.net === null ? '—' : money(row.net),
						money(row.tax),
						row.net === null ? '—' : money(row.net + row.tax),
					],
				})),
				[total, money(taxes.net), money(taxes.tax), money(taxes.gross)]
			);
		case 'refunds':
			return {
				...spec(
					['common.order', 'reports.col_reason', 'common.amount'],
					orders.flatMap((order) =>
						(order.refunds ?? []).map((refund, index) => ({
							key: `${order.uuid}-${refund.id ?? index}`,
							cells: [
								order.number ? `#${order.number}` : unknown,
								refund.reason || '—',
								money(Math.abs(Number(refund.total || 0))),
							],
						}))
					),
					[t('reports.refunded'), '', money(totals.refundTotal)]
				),
				align: ['left', 'left', 'right'],
			};
	}
}
