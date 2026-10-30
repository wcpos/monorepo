import { formatClosureDate } from '../../../../services/register-session/closure-document';

import type { ClosureContext } from '../../../../services/register-session/closure-document';
import type { PanelSpec } from './specs';

type Column = {
	key: string;
	label: string;
	type: PanelSpec['types'][number];
	align: 'left' | 'right';
};
type Meta = {
	key: string;
	title: string;
	label: string;
	storeId: number;
	registerId: string;
	registerName: string;
	from: string;
	to: string;
	generatedAt: string;
};
/** Receipt_Data_Schema owns the wire shape: even numeric cell values are strings. */
export function buildReportDocument(
	spec: PanelSpec,
	columns: Column[],
	meta: Meta,
	context: ClosureContext
) {
	// `is_label`: the first cell merely repeats the heading a narrow template prints above the row
	// (a row's label is its first cell; a subtotal or total's first column is text), so that
	// template may omit it. Same flag the server puts on its reports.
	const cells = (formatted: string[], raw: (string | number)[], summary = false) =>
		columns.map((column, i) => ({
			key: column.key,
			is_first: i === 0,
			is_label: i === 0 && (summary ? column.type === 'text' : true),
			label: column.label,
			value: String(raw[i]),
			formatted: formatted[i],
			align: column.align,
		}));
	const rows = (rows: PanelSpec['rows']) =>
		rows.map((row) => ({
			key: `row-${row.key}`,
			label: row.cells[0],
			cells: cells(row.cells, row.raw),
		}));
	const count = spec.groups
		? spec.groups.reduce((sum, group) => sum + group.rows.length, 0)
		: spec.rows.length;
	const from = formatClosureDate(meta.from, context);
	return {
		report: {
			key: meta.key,
			title: meta.title,
			subtitle: '',
			scope: {
				mode: 'range',
				label: meta.label,
				store_id: meta.storeId,
				register_id: meta.registerId,
				register_name: meta.registerName,
				business_day: from.date_ymd,
				from,
				to: formatClosureDate(meta.to, context),
			},
			group_by: null,
			columns: columns.map((column, i) => ({ ...column, is_first: i === 0 })),
			column_count: columns.length,
			rows: spec.groups ? [] : rows(spec.rows),
			groups: (spec.groups ?? []).map((group) => ({
				key: `group-${group.key}`,
				label: group.label,
				rows: rows(group.rows),
				subtotal: { cells: cells(group.total, group.totalRaw, true) },
			})),
			totals: { cells: cells(spec.total, spec.totalRaw, true) },
			count,
			has_groups: !!spec.groups,
			has_rows: count > 0,
			generated_at: formatClosureDate(meta.generatedAt, context),
			is_partial: false,
			partial_reason: '',
		},
		store: context.store,
		register: { id: meta.registerId, name: meta.registerName },
		software: { name: 'WCPOS', plugin_version: '' },
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
			document_type: 'report',
			receipt_number: '',
			is_report_document: true,
			is_sale_document: false,
			is_refund_document: false,
			is_closure_document: false,
			is_x_report: false,
			is_reprint: false,
			reprint_count: 0,
		},
		i18n: context.i18n,
	};
}
