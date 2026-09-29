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
import { useLocalDate } from '../../../../hooks/use-local-date';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useQueryState } from '../../../../query';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import { cashiers, categories, taxesByRate, tenders, topProducts } from '../cards/aggregate';
import { useLocalProducts } from '../cards/use-local-products';
import { saveOrShareCsv } from '../closures/save-or-share-csv';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { periodLabel } from '../date-button';
import { useReportFormats } from '../use-report-formats';
import { panelCsv } from './export-csv';
import { ReportRows } from './report-rows';
import { panelSpec } from './specs';

const PANEL_WIDTH = 480;
export function DetailPanel() {
	const { detail, setDetail } = useReportsScope(),
		{ selectedOrders, totals } = useReportsData();
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
	const [busy, setBusy] = React.useState(false);
	if (!detail || detail === 'orders') return null;
	const ready =
		formats.store && (detail !== 'categories' || products) && (detail !== 'cashiers' || directory);
	const decimals = formats.store?.price_num_decimals;
	const spec = panelSpec(detail, {
		payments: tenders(selectedOrders, totals, decimals),
		products: topProducts(selectedOrders, totals, decimals),
		categories: categories(selectedOrders, products ?? [], totals, decimals),
		cashiers: cashiers(totals),
		taxes: taxesByRate(selectedOrders, totals, decimals),
		orders: selectedOrders,
		totals,
		formats,
		t,
		cashierNames: Object.fromEntries(
			(directory ?? []).map((user) => [String(user.id), user.display_name || t('common.unknown')])
		),
	});
	const title = t(`reports.panel_${detail}`);
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
			</View>
			<View testID="detail-panel-body" className="min-h-0 flex-1 p-4">
				{ready ? (
					<ReportRows spec={spec} testID={`detail-${detail}`} />
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
						{t('reports.panel_status', {
							count: formats.number(selectedOrders.length),
							total: formats.money(totals.total),
						})}
					</Text>
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
				</View>
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
