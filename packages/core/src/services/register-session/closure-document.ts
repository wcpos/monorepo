import { tz } from '@date-fns/tz';
import { format } from 'date-fns';

import type { ClosureRow, RegisterSessionRow } from '@wcpos/database';
import { fromMinor, toMinor } from '@wcpos/order-math';

type Values = Record<string, unknown>;
export type ClosureContext = {
	store: Values;
	currency: string;
	timezone: string;
	locale: string;
	printedAt: string;
	formatMoney: (value: string) => string;
	i18n: Record<string, string>;
	expected?: Record<string, string>;
	breakdowns?: Values;
};
// Server Receipt_Date_Formatter keys; absent dates remain empty, not today's date.
export function formatClosureDate(
	value: string | null | undefined,
	context: Pick<ClosureContext, 'timezone' | 'locale'>
) {
	const date = value
		? new Date(/[Zz]|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`)
		: null;
	const options = context.timezone === 'device' ? {} : { timeZone: context.timezone };
	const display = (settings: Intl.DateTimeFormatOptions) =>
		date
			? new Intl.DateTimeFormat(context.locale, { ...options, ...settings, hour12: false }).format(
					date
				)
			: '';
	const result: Record<string, string> = {
		datetime: display({ dateStyle: 'medium', timeStyle: 'short' }),
		date: display({ dateStyle: 'medium' }),
		time: display({ timeStyle: 'short' }),
	};
	for (const style of ['short', 'long', 'full'] as const) {
		result[`datetime_${style}`] = display({
			dateStyle: style,
			timeStyle: style === 'short' ? 'short' : style,
		});
		result[`date_${style}`] = display({ dateStyle: style });
	}
	for (const [key, pattern] of Object.entries({
		date_ymd: 'yyyy-MM-dd',
		date_dmy: 'dd/MM/yyyy',
		date_mdy: 'MM/dd/yyyy',
		day: 'dd',
		month: 'MM',
		year: 'yyyy',
	}))
		result[key] = date
			? format(date, pattern, context.timezone === 'device' ? {} : { in: tz(context.timezone) })
			: '';
	for (const style of ['short', 'long'] as const) {
		result[`weekday_${style}`] = display({ weekday: style });
		result[`month_${style}`] = display({ month: style });
	}
	return result;
}
function envelope(row: Partial<ClosureRow>, context: ClosureContext, xreport = false) {
	const money = <T extends Values, K extends string>(values: T, fields: K[]) =>
		Object.assign(
			{},
			values,
			Object.fromEntries(
				fields.map((key) => [`${key}_display`, context.formatMoney(String(values[key] ?? ''))])
			)
		) as T & Record<`${K}_display`, string>;
	const breakdowns = row.breakdowns ?? {};
	const labels: Values = {
		opened_by_name: '',
		closed_by_name: '',
		approved_by_name: '',
		...Object.fromEntries(Object.entries(breakdowns).filter(([key]) => key.endsWith('_name'))),
		...(breakdowns.labels as Values),
	};
	const rows = (key: string, fields: string[]) =>
		Object.entries((breakdowns[key] ?? {}) as Record<string, Values>).map(([key, value]) =>
			money({ ...value, name: value.name ?? value.method ?? value.rate ?? key }, fields)
		);
	const methods = (breakdowns.payment_methods ?? {}) as Record<string, Values>;
	const tenders = [
		...new Set([...Object.keys(row.counted ?? {}), ...Object.keys(row.expected ?? {})]),
	].map((name) => {
		const variance = row.variance?.[name] ?? '';
		const method = Object.values(methods).find((m) => m.method === name) ?? methods[name];
		return money(
			{
				name,
				label: method?.name || name.charAt(0).toUpperCase() + name.slice(1),
				expected: row.expected?.[name] ?? '',
				counted: row.counted?.[name] ?? '',
				variance,
				has_variance: toMinor(variance || '0', 4) !== 0,
				variance_label:
					variance === ''
						? ''
						: context.i18n[
								Number(variance) > 0 ? 'over' : Number(variance) < 0 ? 'short' : 'exact'
							],
				variance_absolute_display: context.formatMoney(variance.replace('-', '')),
			},
			['expected', 'counted', 'variance']
		);
	});
	return {
		closure: {
			has_sales:
				row.period_sales_total != null ||
				row.period_refunds_total != null ||
				Number(breakdowns.transaction_count) > 0,
			has_perpetual: row.perpetual_sales_total != null || row.perpetual_refunds_total != null,
			...Object.fromEntries(
				['payment_methods', 'tax_rates', 'movements'].map((key) => [
					`has_${key}`,
					Object.keys(breakdowns[key] ?? {}).length > 0,
				])
			),
			...money(row, [
				'period_sales_total',
				'period_refunds_total',
				'perpetual_sales_total',
				'perpetual_refunds_total',
				'unsynced_total',
			]),
			opened_at_gmt: row.opened_at,
			opened_by: breakdowns.opened_by ?? null,
			closed_by: row.closed_by ?? null,
			approved_by: breakdowns.approved_by ?? null,
			closed_at_gmt: row.closed_at,
			opened_at: formatClosureDate(row.opened_at, context),
			closed_at: formatClosureDate(row.closed_at, context),
			tenders,
			breakdowns: {
				...breakdowns,
				labels,
				payment_methods: rows('payment_methods', ['sales', 'refunds']),
				tax_rates: rows('tax_rates', ['net', 'tax', 'gross']),
				opening_float: money((breakdowns.opening_float ?? {}) as Values, [
					'expected',
					'counted',
					'variance',
				]),
				movements: ((breakdowns.movements ?? []) as Values[]).map((m) => ({
					...money(m, ['amount']),
					created_at: formatClosureDate((m.created_at_gmt ?? m.created_at) as string, context),
					type_label: context.i18n[String(m.type)] ?? m.type,
					voided: !!m.voided_by,
				})),
				cashiers: ((breakdowns.cashiers ?? []) as (Values | string)[]).map((c) =>
					typeof c === 'string' ? { id: Number(c), name: c } : c
				),
			},
		},
		store: context.store,
		register: { id: row.register_id, name: labels.register_name ?? '' },
		software: { name: 'WCPOS', plugin_version: row.software_version ?? '' },
		order: { currency: context.currency, printed: formatClosureDate(context.printedAt, context) },
		fiscal: {
			immutable_id: '',
			hash: '',
			qr_payload: '',
			tax_agency_code: '',
			signature_excerpt: '',
			document_label: '',
			sequence: null,
			signed_at: null,
			extra_fields: [],
			document_type: xreport ? 'xreport' : 'closure',
			receipt_number: xreport ? '' : String(row.number),
			is_sale_document: false,
			is_refund_document: false,
			is_closure_document: true,
			is_x_report: xreport,
			is_reprint: !xreport && !!row.print_count,
			reprint_count: xreport ? 0 : (row.print_count ?? 0),
		},
		i18n: context.i18n,
	};
}
export function buildClosureDocument(row: ClosureRow, context: ClosureContext) {
	return envelope(
		{ ...row, number: row.printed_number ?? row.server_number ?? row.number },
		context
	);
}
export function buildXReportDocument(session: RegisterSessionRow, context: ClosureContext) {
	const expected = context.expected ?? session.server_expected ?? {};
	const counted = session.counted ?? {};
	return envelope(
		{
			id: session.id,
			register_id: session.register_id,
			store_id: session.store_id,
			opened_at: session.opened_at_gmt,
			expected,
			counted,
			variance: Object.fromEntries(
				Object.entries(counted).map(([key, value]) => [
					key,
					fromMinor(toMinor(value, 4) - toMinor(expected[key] ?? '0', 4), 4),
				])
			),
			breakdowns: {
				...context.breakdowns,
				opening_float: {
					expected: session.expected_float,
					counted: session.counted_float,
					variance: session.opening_variance,
				},
			},
		},
		context,
		true
	);
}
