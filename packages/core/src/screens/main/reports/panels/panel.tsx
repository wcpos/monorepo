import * as React from 'react';
import { View } from 'react-native';

import { filter } from 'rxjs';
import { format } from 'date-fns/format';
import { useObservableState } from 'observable-hooks';

import { observeSiteCredentials, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { Breadcrumb } from '@wcpos/components/breadcrumb';
import { useIsPhone } from '@wcpos/components/lib/device';
import { DialogFooter, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../../hooks/use-local-date';
import { inZone, useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useQueryHandleFields, useQueryState } from '../../../../query';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import {
	useRegisterNames,
	useRegisterNamesReady,
} from '../../../../services/register/use-register-names';
import {
	cashiers,
	categories,
	channels,
	registers,
	taxesByRate,
	tenders,
	topProducts,
} from '../cards/aggregate';
import { useLocalProducts } from '../cards/use-local-products';
import { saveOrShareCsv } from '../closures/save-or-share-csv';
import {
	useIncludedStatus,
	useReportsData,
	useReportsHandles,
	useReportsPeriod,
	useReportsScope,
	useReportsSelection,
} from '../context';
import { brands, cogsEnabled, lineCost } from '../margin';
import { useLocalCategories } from '../cards/use-local-categories';
import { periodLabel } from '../date-button';
import { ReportPanel } from '../report-panel';
import { useReportFormats } from '../use-report-formats';
import { panelCsv } from './export-csv';
import { panelSpec } from './specs';
import { usePrintWaiting } from './use-print-waiting';
import { buildReportDocument } from './document';
import { OrdersPanel } from './orders-panel';
import { useClosureDocumentContext } from '../../../../services/register-session/use-closure-document-context';
import { useReceiptDocument } from '../../receipt/use-receipt-document';
import { PrintSheet, PrintSheetInner } from '../../receipt/print-sheet';

export function DetailPanel() {
	const { detail, setDetail } = useReportsScope(),
		{ allOrders, selectedOrders, totals, periodRefunds } = useReportsData();
	const included = useIncludedStatus();
	const { unselectedRowIds } = useReportsSelection();
	const includedOrders = allOrders
		.filter(included)
		.sort((a, b) => (b.date_created_gmt ?? '').localeCompare(a.date_created_gmt ?? ''));
	const leftOut = includedOrders.filter((order) => unselectedRowIds[order.uuid]).length;
	const { dateRange, storeId, timezone } = useReportsPeriod(),
		formats = useReportFormats(storeId);
	const t = useT();
	const phone = useIsPhone(),
		close = () => setDetail(null);
	const { presets } = useStoreDay(storeId),
		{ formatDate } = useLocalDate();
	const scope = {
		from: format(dateRange.start, 'yyyy-MM-dd', zoneOptions(timezone)),
		to: format(dateRange.end, 'yyyy-MM-dd', zoneOptions(timezone)),
	};
	const { text: period } = periodLabel({ scope, timezone, ranges: presets(), t, formatDate });
	const registerId = useQueryState<'orders'>().filters.register;
	const names = useRegisterNames(storeId),
		registerNamesReady = useRegisterNamesReady(storeId),
		binding = useRegisterBinding();
	const register = registerId
		? names[registerId] ||
			(binding.registerId === registerId ? binding.registerName : '') ||
			t('common.unknown')
		: t('reports.all_registers');
	const { site } = useStoreSession();
	const source = React.useMemo(
		() => observeSiteCredentials(site).pipe(filter((value) => value !== PENDING_USER_DB_READ)),
		[site]
	);
	const directory = useObservableState(source);
	const ids = [...selectedOrders, ...(periodRefunds ?? [])].flatMap((order) =>
		(order.line_items ?? []).flatMap((line) => (line.product_id == null ? [] : [line.product_id]))
	);
	const grouped = detail === 'products' || detail === 'categories' || detail === 'brands';
	const products = useLocalProducts(grouped ? ids : []);
	const tree = useLocalCategories(
		detail === 'categories'
			? (products ?? []).flatMap((product) =>
					(product.categories ?? []).flatMap((category) =>
						category.id == null ? [] : [category.id]
					)
				)
			: []
	);
	const [error, setError] = React.useState('');
	const [generatedAt] = React.useState(() => new Date().toISOString());
	const [printError, setPrintError] = React.useState('');
	const [sheetOpen, setSheetOpen] = React.useState(false);
	const [busy, setBusy] = React.useState(false);

	// Orders names its cashiers too: the CSV must not carry "Unknown" for a directory still loading.
	// Products, categories and brands net refunds: without them they would print gross figures.
	const ready =
		formats.store &&
		((detail !== 'refunds' && !grouped) || periodRefunds !== undefined) &&
		(!grouped || products) &&
		(detail !== 'categories' || tree) &&
		(detail !== 'cashiers' && detail !== 'orders' ? true : !!directory) &&
		(detail !== 'registers' || registerNamesReady);
	const decimals = formats.store?.price_num_decimals;
	const spec = panelSpec(detail ?? 'orders', {
		cogs:
			cogsEnabled(selectedOrders, products ?? []) ||
			(periodRefunds ?? []).some((refund) =>
				(refund.line_items ?? []).some((line) => lineCost(line) !== null)
			),
		num_decimals: decimals,
		categoryTree: tree,
		periodRefunds,
		brands: brands(selectedOrders, products ?? [], totals, decimals, periodRefunds),
		payments: tenders(selectedOrders, totals, decimals),
		products: topProducts(selectedOrders, totals, decimals, periodRefunds, products),
		categories: categories(
			selectedOrders,
			products ?? [],
			totals,
			decimals,
			undefined,
			undefined,
			periodRefunds
		),
		cashiers: cashiers(totals),
		channels: channels(selectedOrders, totals),
		registers: registers(selectedOrders, totals),
		registerNames: names,
		taxes: taxesByRate(selectedOrders, totals, decimals),
		orders: detail === 'orders' ? includedOrders : selectedOrders,
		unselectedRowIds,
		orderTime: (order) =>
			order.date_created_gmt
				? formatDate(inZone(timezone, convertUTCStringToLocalDate(order.date_created_gmt)), 'HH:mm')
				: t('common.unknown'),
		totals,
		formats,
		t,
		cashierNames: Object.fromEntries(
			(directory ?? []).map((user) => [String(user.id), user.display_name || t('common.unknown')])
		),
	});
	const titles: Record<NonNullable<typeof detail>, string> = {
		orders: t('reports.panel_orders'),
		payments: t('reports.panel_payments'),
		products: t('reports.panel_products'),
		categories: t('reports.panel_categories'),
		brands: t('reports.panel_brands'),
		cashiers: t('reports.panel_cashiers'),
		taxes: t('reports.panel_taxes'),
		refunds: t('reports.panel_refunds'),
		channels: t('reports.panel_channels'),
		registers: t('reports.panel_registers'),
	};
	const title = titles[detail ?? 'orders'];
	const scopeLine = t('reports.panel_scope', { period, register });
	const context = useClosureDocumentContext(storeId);
	const document = buildReportDocument(
		spec,
		spec.keys.map((key, i) => ({
			key,
			label: spec.head[i],
			type: spec.types[i],
			align: spec.align[i],
		})),
		{
			key: detail ?? 'orders',
			title,
			label: scopeLine,
			storeId: storeId ?? 0,
			registerId: registerId ?? '',
			registerName: register,
			from: dateRange.start.toISOString(),
			to: dateRange.end.toISOString(),
			generatedAt,
		},
		context
	);
	const doc = useReceiptDocument({
		autoPrintAllowed: false,
		templateType: 'report',
		storeId,
		localReport: document,
	});
	// A range still arriving over ranged sync passes is a partial set (see ReportsSyncProgress):
	// the document would claim a whole period it does not hold, so Print waits for the lane.
	const { handle: salesHandle, refundsHandle } = useReportsHandles();
	// Ready-gated, as the progress line: a read that has not answered reports no lane.
	const sales = useQueryHandleFields(salesHandle, ['laneProgress']);
	const refunds = useQueryHandleFields(refundsHandle, ['laneProgress']);
	const laneProgress = sales.ready ? sales.laneProgress : null;
	const refundLaneProgress = refunds.ready ? refunds.laneProgress : null;
	const { waiting, label: waitingLabel } = usePrintWaiting({
		doc,
		storeReady: !!formats.store,
		dataReady: !!ready,
		salesLane: !!laneProgress,
		refundsLane: !!refundLaneProgress,
		needsRefunds: detail === 'refunds' || grouped,
	});
	if (!detail) return null;
	const counted = {
		n: formats.quantity(selectedOrders.length),
		m: formats.quantity(includedOrders.length),
	};
	const status = {
		n: formats.quantity(spec.missing?.n),
		m: formats.quantity(spec.missing?.m),
		count: formats.quantity(selectedOrders.length),
		total: formats.money(totals.total),
	};
	const exportCsv = async () => {
		if (busy) return;
		setBusy(true);
		setError('');
		try {
			await saveOrShareCsv(panelCsv(spec), `sales-${detail}-${scope.from}-${scope.to}.csv`);
		} catch {
			setError(t('reports.export_failed'));
		} finally {
			setBusy(false);
		}
	};
	const print = async () => {
		setError('');
		setPrintError('');
		try {
			const ok = await doc.print();
			if (ok === false) setPrintError(t('reports.print_failed'));
		} catch {
			setPrintError(t('reports.print_failed'));
		}
	};
	const header = (
		<DialogHeader>
			{phone ? (
				<Breadcrumb
					testID="detail-panel-crumb"
					parents={[{ label: t('reports.sales'), onPress: close, testID: 'detail-panel-back' }]}
					here={title}
					autoFocus
				/>
			) : (
				<DialogTitle>{title}</DialogTitle>
			)}
			<Text testID="detail-panel-scope" className="text-muted-foreground">
				{scopeLine}
			</Text>
		</DialogHeader>
	);
	const exportError = !!error && (
		<Text testID="detail-panel-export-error" className="text-bad px-4">
			{error}
		</Text>
	);
	const documentError = printError || doc.documentError?.message;
	const aside = (
		<Text testID={spec.missing ? 'detail-panel-cost-missing' : undefined} tabular>
			{detail === 'orders'
				? leftOut
					? t('reports.orders_counted_left_out', counted)
					: t('reports.orders_counted', counted)
				: spec.missing
					? t('reports.cost_missing_status', status)
					: t('reports.panel_status', status)}
		</Text>
	);
	const secondary = !!ready && {
		label: t('reports.export_csv'),
		testID: 'detail-panel-export',
		loading: busy,
		onPress: () => void exportCsv(),
	};
	if (detail !== 'orders')
		return (
			<ReportPanel testID="detail-panel" wide onClose={close}>
				<PrintSheetInner
					header={header}
					doc={doc}
					title={title}
					description={scopeLine}
					printLabel={t('reports.print_report')}
					waiting={waiting ? waitingLabel : null}
					error={
						<>
							{exportError}
							{documentError ? (
								<Text variant="key" className="text-bad px-4" testID="print-sheet-error">
									{documentError}
								</Text>
							) : null}
						</>
					}
					onPrint={print}
					printTestID="detail-panel-print"
					footerTestID="detail-panel-footer"
					aside={aside}
					secondary={secondary}
					fullWidth={phone}
				/>
			</ReportPanel>
		);
	return (
		<ReportPanel testID="detail-panel" wide={spec.head.length > 4} onClose={close}>
			{header}
			<View testID="detail-panel-body" className="min-h-0 flex-1 px-4">
				{ready ? (
					<OrdersPanel spec={spec} quantity={formats.quantity} />
				) : (
					<Text>{t('common.loading')}</Text>
				)}
			</View>
			{exportError}
			<DialogFooter
				testID="detail-panel-footer"
				aside={aside}
				secondary={[
					secondary,
					{
						label: t('reports.print_report'),
						testID: 'detail-panel-print',
						loading: doc.isPrinting,
						onPress: () => setSheetOpen(true),
					},
				]}
			/>
			<PrintSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				doc={doc}
				title={title}
				description={scopeLine}
				printLabel={t('reports.print_report')}
				waiting={waiting ? waitingLabel : null}
				error={printError || doc.documentError?.message || null}
				onPrint={print}
				testID="detail-panel-print-sheet"
			/>
		</ReportPanel>
	);
}
