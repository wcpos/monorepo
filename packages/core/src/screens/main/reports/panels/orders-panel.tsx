import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Checkbox } from '@wcpos/components/checkbox';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsSelection } from '../context';

import type { PanelSpec } from './specs';

/** The full spec feeds export/print; only the first sixty checklist rows are painted. */
export function OrdersPanel({
	spec,
	quantity,
}: {
	spec: PanelSpec;
	quantity: (n: number) => string;
}) {
	const t = useT();
	const { unselectedRowIds, setUnselectedRowIds } = useReportsSelection();
	const leftOut = spec.rows.filter((row) => unselectedRowIds[row.key]).length;
	const toggle = (keys: (string | number)[], include: boolean) =>
		setUnselectedRowIds((previous) => {
			const next = { ...previous };
			for (const key of keys) {
				if (include) delete next[key];
				else next[key] = true;
			}
			return next;
		});
	return (
		<ScrollView testID="orders-list" className="flex-1">
			<View className="min-h-12 flex-row items-center gap-3 border-b py-2">
				<Checkbox
					testID="orders-panel-tick-all"
					className="size-11"
					accessibilityLabel={t('reports.toggle_selection')}
					checked={spec.rows.length > 0 && leftOut === 0}
					disabled={spec.rows.length === 0}
					indeterminate={leftOut > 0 && leftOut < spec.rows.length}
					onCheckedChange={() =>
						toggle(
							spec.rows.map((row) => row.key),
							leftOut > 0
						)
					}
				/>
				<Text className="flex-1 font-semibold">{t('reports.all_orders')}</Text>
				{leftOut > 0 && (
					<Text className="text-muted-foreground">
						{t('reports.n_left_out', { count: leftOut, n: quantity(leftOut) })}
					</Text>
				)}
			</View>
			{spec.rows.slice(0, 60).map((row) => (
				<View
					key={row.key}
					testID={`orders-panel-row-${row.key}`}
					className={`min-h-12 flex-row items-center gap-3 border-b py-2 ${unselectedRowIds[row.key] ? 'opacity-50' : ''}`}
				>
					<Checkbox
						testID={`orders-panel-tick-${row.key}`}
						className="size-11"
						accessibilityLabel={t('reports.include_order', {
							number: row.cells[0].replace(/^#/, ''),
						})}
						checked={!unselectedRowIds[row.key]}
						onCheckedChange={(checked) => toggle([row.key], checked)}
					/>
					<View className="min-w-0 flex-1">
						<Text className="font-semibold">{row.cells[0]}</Text>
						<Text className="text-muted-foreground">
							{t('reports.order_time_cashier', { time: row.cells[1], cashier: row.cells[2] })}
						</Text>
					</View>
					<View className="shrink items-end">
						<Text className="tabular-nums">{row.cells[4]}</Text>
						<Text className="text-muted-foreground">{row.cells[3]}</Text>
					</View>
				</View>
			))}
			{spec.rows.length === 0 && <Text className="py-3">{t('reports.no_orders_in_period')}</Text>}
			{spec.rows.length > 60 && (
				<Text className="text-muted-foreground py-3">
					{t('reports.and_n_more', {
						count: spec.rows.length - 60,
						n: quantity(spec.rows.length - 60),
					})}
				</Text>
			)}
		</ScrollView>
	);
}
