import * as React from 'react';
import { View } from 'react-native';

import { format } from 'date-fns/format';

import { saleMomentOf } from '@wcpos/query/query-state';
import { Breadcrumb } from '@wcpos/components/breadcrumb';
import { useIsPhone } from '@wcpos/components/lib/device';
import { DialogFooter, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';

import { usePageSheetHost } from '../../components/page-sheet-host';
import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../../hooks/use-local-date';
import { inZone, zoneOptions } from '../../../../hooks/use-store-day';
import {
	cashiers,
	categories,
	channels,
	registers,
	stores,
	taxesByRate,
	tenders,
	topProducts,
} from '../cards/aggregate';
import { useLocalProducts } from '../cards/use-local-products';
import { saveOrShareCsv } from '../closures/save-or-share-csv';
import {
	useIncludedStatus,
	useReportsData,
	useReportsPeriod,
	useReportsScope,
	useReportsSelection,
} from '../context';
import { brands, cogsEnabled, lineCost } from '../margin';
import { useLocalCategories } from '../cards/use-local-categories';
import { ReportPanel } from '../report-panel';
import { useReportFormats } from '../use-report-formats';
import { MenuChip } from '../menu-chip';
import { useReportsFilterScope } from '../scope';
import { brandChoices, categoryChoices, filterLines } from './line-filters';
import { panelCsv } from './export-csv';
import { panelSpec } from './specs';
import { useReportPrint } from './use-report-print';
import { OrdersPanel } from './orders-panel';
import { PrintSheet, PrintSheetInner } from '../../receipt/print-sheet';

export function DetailPanel() {
	const { detail } = useReportsScope();
	return <DetailPanelContent key={detail} />;
}

function DetailPanelContent() {
	const host = usePageSheetHost();
	const { detail, setDetail } = useReportsScope(),
		{ allOrders, selectedOrders, totals, periodRefunds } = useReportsData();
	const included = useIncludedStatus();
	const selection = useReportsSelection();
	const { unselectedRowIds } = selection;
	const includedOrders = allOrders
		.filter(included)
		.sort((a, b) => (saleMomentOf(b) ?? '').localeCompare(saleMomentOf(a) ?? ''));
	const leftOut = includedOrders.filter((order) => unselectedRowIds[order.uuid]).length;
	const { dateRange, storeId, timezone } = useReportsPeriod(),
		formats = useReportFormats(storeId);
	const t = useT();
	const phone = useIsPhone(),
		close = () => setDetail(null);
	const { formatDate } = useLocalDate();
	const scope = {
		from: format(dateRange.start, 'yyyy-MM-dd', zoneOptions(timezone)),
		to: format(dateRange.end, 'yyyy-MM-dd', zoneOptions(timezone)),
	};
	const { names, namesReady } = useReportsFilterScope();
	const ids = [...selectedOrders, ...(periodRefunds ?? [])].flatMap((order) =>
		(order.line_items ?? []).flatMap((line) => (line.product_id == null ? [] : [line.product_id]))
	);
	const grouped = detail === 'products' || detail === 'categories' || detail === 'brands';
	const products = useLocalProducts(grouped ? ids : []);
	const tree = useLocalCategories(
		detail === 'categories' || detail === 'products'
			? (products ?? []).flatMap((product) =>
					(product.categories ?? []).flatMap((category) =>
						category.id == null ? [] : [category.id]
					)
				)
			: []
	);
	const [categoryId, setCategoryId] = React.useState('all');
	const [brandId, setBrandId] = React.useState('all');
	const categoryOptions = categoryChoices(
		products ?? [],
		tree ?? new Map(),
		t('reports.chain_separator'),
		t('common.unknown')
	);
	const brandOptions = brandChoices(products ?? []);
	const filters = {
		categoryId: detail === 'products' && categoryId !== 'all' ? categoryId : undefined,
		brandId: detail === 'products' && brandId !== 'all' ? brandId : undefined,
	};
	const filteredOrders = filterLines(selectedOrders, products ?? [], tree ?? new Map(), filters);
	const filteredRefunds = filterLines(
		periodRefunds ?? [],
		products ?? [],
		tree ?? new Map(),
		filters
	);
	const filtering = filters.categoryId !== undefined || filters.brandId !== undefined;
	const [error, setError] = React.useState('');
	const [sheetOpen, setSheetOpen] = React.useState(false);
	const [busy, setBusy] = React.useState(false);

	// Orders names its cashiers too: the CSV must not carry "Unknown" for a directory still loading.
	// Products, categories and brands net refunds: without them they would print gross figures.
	const ready =
		formats.store &&
		((detail !== 'refunds' && !grouped) || periodRefunds !== undefined) &&
		(!grouped || products) &&
		((detail !== 'categories' && detail !== 'products') || tree) &&
		(detail !== 'cashiers' && detail !== 'orders' ? true : namesReady.cashier) &&
		(detail !== 'registers' || namesReady.register) &&
		(detail !== 'stores' || namesReady.store);
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
		products: topProducts(filteredOrders, totals, decimals, filteredRefunds, products),
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
		registerNames: names.register,
		stores: stores(selectedOrders, totals),
		storeNames: names.store,
		taxes: taxesByRate(selectedOrders, totals, decimals),
		orders: detail === 'orders' ? includedOrders : selectedOrders,
		unselectedRowIds,
		orderTime: (order) => {
			const moment = saleMomentOf(order);
			return moment
				? formatDate(inZone(timezone, convertUTCStringToLocalDate(moment)), 'HH:mm')
				: t('common.unknown');
		},
		totals,
		formats,
		t,
		cashierNames: names.cashier,
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
		stores: t('reports.panel_stores'),
	};
	const title = titles[detail ?? 'orders'];
	const {
		doc,
		waiting,
		print,
		error: printError,
		label: scopeLine,
	} = useReportPrint({
		key: detail ?? 'orders',
		title,
		spec,
		scope: [
			categoryOptions.find((row) => row.value === filters.categoryId)?.label,
			brandOptions.find((row) => row.value === filters.brandId)?.label,
		],
		dataReady: !!ready,
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
	// Read only while a filter is on: a spec a test stubs without rows must not throw here.
	const productStatus = filtering
		? {
				n: formats.quantity(spec.rows.length),
				total: spec.total[spec.keys.indexOf('amount')],
				k: status.n,
				m: status.m,
			}
		: status;
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
	const printReport = () => {
		setError('');
		return print();
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
			{detail === 'products' && (
				<View testID="detail-panel-filters" className="flex-row flex-wrap gap-2">
					{categoryOptions.length > 0 && (
						<MenuChip
							name="category"
							icon="category"
							value={categoryId}
							defaultValue="all"
							onChange={setCategoryId}
							choices={[{ value: 'all', label: t('reports.all_categories') }, ...categoryOptions]}
							scroll
							ids={{
								trigger: 'detail-panel-category',
								menu: 'detail-panel-category-menu',
								row: (value) => `detail-panel-category-${value}`,
								clear: 'detail-panel-category-clear',
							}}
						/>
					)}
					{brandOptions.length > 0 && (
						<MenuChip
							name="brand"
							icon="tags"
							value={brandId}
							defaultValue="all"
							onChange={setBrandId}
							choices={[{ value: 'all', label: t('reports.all_brands') }, ...brandOptions]}
							scroll
							ids={{
								trigger: 'detail-panel-brand',
								menu: 'detail-panel-brand-menu',
								row: (value) => `detail-panel-brand-${value}`,
								clear: 'detail-panel-brand-clear',
							}}
						/>
					)}
				</View>
			)}
		</DialogHeader>
	);
	const exportError = !!error && (
		<Text testID="detail-panel-export-error" className="text-bad px-4">
			{error}
		</Text>
	);
	const aside = (
		<Text testID={spec.missing ? 'detail-panel-cost-missing' : undefined} tabular>
			{detail === 'orders'
				? leftOut
					? t('reports.orders_counted_left_out', counted)
					: t('reports.orders_counted', counted)
				: filtering
					? spec.missing
						? t('reports.products_cost_missing_status', productStatus)
						: t('reports.products_status', productStatus)
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
					waiting={waiting}
					error={
						<>
							{exportError}
							{printError ? (
								<Text variant="key" className="text-bad px-4" testID="print-sheet-error">
									{printError}
								</Text>
							) : null}
						</>
					}
					onPrint={printReport}
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
					<OrdersPanel spec={spec} quantity={formats.quantity} selection={selection} />
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
				portalHost={host}
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				doc={doc}
				title={title}
				description={scopeLine}
				printLabel={t('reports.print_report')}
				waiting={waiting}
				error={printError}
				onPrint={printReport}
				testID="detail-panel-print-sheet"
			/>
		</ReportPanel>
	);
}
