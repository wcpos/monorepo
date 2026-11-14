import * as React from 'react';

import { Notice } from '@wcpos/components/notice';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useViewedStore } from '../../../hooks/use-store-day';
import { type QueryHandle, useQueryHandleValue } from '../../../query';
import { useIncludedStatus } from './context';
import { salesFigures } from './report/sales-figures';
import { useReportsFilterScope } from './scope';
import { useReportFormats } from './use-report-formats';

export interface NoStoreSummary {
	count: number;
	amount: number;
	view: () => void;
}
export const NoStoreSummaryContext = React.createContext<NoStoreSummary | undefined>(undefined);

export function NoStoreProvider({
	handle,
	enabled,
	onView,
	children,
}: React.PropsWithChildren<{
	handle: QueryHandle;
	enabled: boolean;
	onView: () => void;
}>): React.JSX.Element {
	const { ready, error, result } = useQueryHandleValue(handle);
	const included = useIncludedStatus();
	const { storeId } = useReportsFilterScope();
	const decimals = useDocField(useViewedStore(storeId), (value) => value.price_num_decimals);
	const value = React.useMemo(() => {
		if (!enabled || !ready || error) return undefined;
		const orders = result.hits
			.map((hit) => {
				const record = hit.record as EngineRecord<'orders'>;
				return { ...record.payload, uuid: record.uuid };
			})
			.filter(included);
		return { count: orders.length, amount: salesFigures({ orders, decimals }).gross, view: onView };
	}, [enabled, ready, error, result.hits, included, decimals, onView]);
	return <NoStoreSummaryContext.Provider value={value}>{children}</NoStoreSummaryContext.Provider>;
}

export function useNoStoreSummary(): NoStoreSummary | undefined {
	return React.useContext(NoStoreSummaryContext);
}

export function NoStoreNotice(): React.JSX.Element | null {
	const summary = useNoStoreSummary();
	const { storeId, allStores, noStore, registerId } = useReportsFilterScope();
	const { money, quantity } = useReportFormats(storeId);
	const t = useT();
	if (!summary || summary.count === 0 || allStores || noStore || registerId) return null;
	const { count, amount, view } = summary;
	return (
		<Notice
			tone="info"
			testID="reports-no-store-notice"
			title={t('reports.no_store_orders', { count, n: quantity(count), amount: money(amount) })}
			actions={[
				{ label: t('common.view'), onPress: view, testID: 'reports-no-store-view', primary: true },
			]}
		/>
	);
}
