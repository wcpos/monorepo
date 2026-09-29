import * as React from 'react';
import { Platform, View } from 'react-native';

import { format } from 'date-fns';
import { useObservableState } from 'observable-hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Breadcrumb } from '@wcpos/components/breadcrumb';
import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import type { WPCredentialsDocument } from '@wcpos/database';

import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../../hooks/use-local-date';
import { inZone, useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useQueryState } from '../../../../query';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import { cashiers, categories, taxesByRate, tenders, topProducts } from '../cards/aggregate';
import { useLocalProducts } from '../cards/use-local-products';
import { saveOrShareCsv } from '../closures/save-or-share-csv';
import {
	useIncludedStatus,
	useReportsData,
	useReportsPeriod,
	useReportsScope,
	useReportsSelection,
} from '../context';
import { periodLabel } from '../date-button';
import { useReportFormats } from '../use-report-formats';
import { panelCsv } from './export-csv';
import { ReportRows } from './report-rows';
import { panelSpec } from './specs';
import { buildReportDocument } from './document';
import { OrdersPanel } from './orders-panel';
import { useClosureDocumentContext } from '../../../../services/register-session/use-closure-document-context';
import { useReceiptDocument } from '../../receipt/use-receipt-document';
import { TemplateSwitcher } from '../../receipt/template-switcher';

const PANEL_WIDTH = 480;
export function DetailPanel() {
	const { detail, setDetail } = useReportsScope(),
		{ allOrders, selectedOrders, totals } = useReportsData();
	const included = useIncludedStatus();
	const { unselectedRowIds } = useReportsSelection();
	const includedOrders = allOrders
		.filter(included)
		.sort((a, b) => (b.date_created_gmt ?? '').localeCompare(a.date_created_gmt ?? ''));
	const leftOut = includedOrders.filter((order) => unselectedRowIds[order.uuid]).length;
	const { dateRange, storeId, timezone } = useReportsPeriod(),
		formats = useReportFormats(storeId);
	const { screenSize } = useTheme(),
		{ bottom } = useSafeAreaInsets(),
		t = useT();
	const phone = screenSize === 'sm',
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
		binding = useRegisterBinding();
	const register = registerId
		? names[registerId] ||
			(binding.registerId === registerId ? binding.registerName : '') ||
			t('common.unknown')
		: t('reports.all_registers');
	const { site } = useStoreSession();
	const source = React.useMemo(() => site.populate$('wp_credentials'), [site]);
	const directory = useObservableState(source) as WPCredentialsDocument[] | undefined;
	const ids = selectedOrders.flatMap((order) =>
		(order.line_items ?? []).flatMap((line) => (line.product_id == null ? [] : [line.product_id]))
	);
	const products = useLocalProducts(detail === 'categories' ? ids : []);
	const [error, setError] = React.useState('');
	const [generatedAt] = React.useState(() => new Date().toISOString());
	const [printError, setPrintError] = React.useState('');
	const [busy, setBusy] = React.useState(false);

	// Orders names its cashiers too: the CSV must not carry "Unknown" for a directory still loading.
	const ready =
		formats.store &&
		(detail !== 'categories' || products) &&
		(detail !== 'cashiers' && detail !== 'orders' ? true : !!directory);
	const decimals = formats.store?.price_num_decimals;
	const spec = panelSpec(detail ?? 'orders', {
		payments: tenders(selectedOrders, totals, decimals),
		products: topProducts(selectedOrders, totals, decimals),
		categories: categories(selectedOrders, products ?? [], totals, decimals),
		cashiers: cashiers(totals),
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
	const title = t(`reports.panel_${detail}`);
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
			label: t('reports.panel_scope', { period, register }),
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
	const waiting: 'store' | 'data' | 'templates' | 'no-template' | null = !formats.store
		? 'store'
		: !ready
			? 'data'
			: !doc.templatesReady
				? 'templates'
				: doc.templates.length === 0
					? 'no-template'
					: null;
	const waitingLabels = {
		store: 'reports.print_waiting_store',
		data: 'reports.print_waiting_data',
		templates: 'reports.print_waiting_templates',
		'no-template': 'reports.print_no_local_template',
	} as const;
	if (!detail) return null;
	const content = (
		<View
			testID="detail-panel"
			// No z-index of its own: the dialog's close button is a later sibling and must paint above.
			className="bg-card relative min-h-0 min-w-0 flex-1 overflow-hidden"
			style={
				!phone && Platform.OS === 'web'
					? {
							position: 'absolute',
							right: 0,
							top: 0,
							bottom: 0,
							width: PANEL_WIDTH,
							maxWidth: '100%',
						}
					: undefined
			}
		>
			<View className={`gap-1 border-b p-4 ${phone ? '' : 'pr-14'}`}>
				{phone ? (
					<Breadcrumb
						testID="detail-panel-crumb"
						parents={[{ label: t('reports.sales'), onPress: close, testID: 'detail-panel-back' }]}
						here={title}
						autoFocus
					/>
				) : (
					<DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
				)}
				<Text testID="detail-panel-scope" className="text-muted-foreground">
					{t('reports.panel_scope', { period, register })}
				</Text>
				<View testID="detail-panel-template">
					<TemplateSwitcher
						templates={doc.templates}
						selectedId={doc.selectedTemplateId}
						onSelect={doc.setSelectedTemplateId}
						isOffline={doc.isOffline}
						alwaysVisible
					/>
				</View>
			</View>
			<View testID="detail-panel-body" className="min-h-0 flex-1 p-4">
				{ready ? (
					detail === 'orders' ? (
						<OrdersPanel spec={spec} quantity={formats.quantity} />
					) : (
						<ReportRows spec={spec} testID={`detail-${detail}`} />
					)
				) : (
					<Text>{t('common.loading')}</Text>
				)}
			</View>
			<View
				testID="detail-panel-footer"
				className="gap-2 border-t p-4"
				style={phone ? { paddingBottom: bottom + 16 } : undefined}
			>
				<View className="flex-row items-center justify-between gap-3">
					<Text className="min-w-0 flex-1 tabular-nums">
						{detail === 'orders'
							? t(leftOut ? 'reports.orders_counted_left_out' : 'reports.orders_counted', {
									n: formats.quantity(selectedOrders.length),
									m: formats.quantity(includedOrders.length),
								})
							: t('reports.panel_status', {
									count: formats.number(selectedOrders.length),
									total: formats.money(totals.total),
								})}
					</Text>
				</View>
				<View className="flex-row items-center justify-end gap-3">
					{ready && (
						<Button
							testID="detail-panel-export"
							variant="outline"
							className="min-h-12"
							loading={busy}
							onPress={async () => {
								if (busy) return;
								setBusy(true);
								setError('');
								try {
									await saveOrShareCsv(
										panelCsv(spec),
										`sales-${detail}-${scope.from}-${scope.to}.csv`
									);
								} catch {
									setError(t('reports.export_failed'));
								} finally {
									setBusy(false);
								}
							}}
						>
							{t('reports.export_csv')}
						</Button>
					)}
					{waiting && (
						<Text
							testID="detail-panel-print-waiting"
							className="text-muted-foreground min-w-0 flex-1 text-sm"
						>
							{t(waitingLabels[waiting])}
						</Text>
					)}
					<Button
						testID="detail-panel-print"
						className="min-h-12"
						disabled={!!waiting}
						loading={doc.isPrinting}
						onPress={async () => {
							setPrintError('');
							try {
								const ok = await doc.print();
								if (ok === false) setPrintError(t('reports.print_failed'));
							} catch {
								setPrintError(t('reports.print_failed'));
							}
						}}
					>
						{t('reports.print')}
					</Button>
				</View>
				{!!(printError || doc.documentError) && (
					<Text testID="detail-panel-print-error" className="text-destructive">
						{printError || doc.documentError?.message}
					</Text>
				)}
				{!!error && (
					<Text testID="detail-panel-export-error" className="text-destructive">
						{error}
					</Text>
				)}
			</View>
		</View>
	);
	return phone ? (
		content
	) : (
		<Dialog open onOpenChange={(open) => !open && close()}>
			<DialogContent
				side="right"
				portalHost="reports"
				className="bg-card z-50 flex-col gap-0 overflow-hidden p-0"
				style={
					Platform.OS === 'web'
						? { display: 'contents' }
						: { width: PANEL_WIDTH, maxWidth: '100%', height: '100%' }
				}
				closeButtonProps={{
					testID: 'detail-panel-close',
					accessibilityLabel: t('common.close'),
					className: 'h-12 w-12 items-center justify-center',
				}}
			>
				{content}
			</DialogContent>
		</Dialog>
	);
}
