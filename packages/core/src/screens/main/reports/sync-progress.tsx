import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';
import { useQueryHandleFields } from '../../../query';
import { useReportsHandles } from './context';

/**
 * "12,400 of 30,000 orders downloaded" while a ranged report is still being fetched (#954).
 *
 * A report declares `limit=all`, so unlike every other grid its window is a promise to hold
 * the WHOLE range — and a range larger than one drain pass arrives over several passes. Until
 * it lands, the chart, the totals card and the Z-report are all computed from a partial set,
 * which is indistinguishable from a genuinely quiet day. This line is the only thing that
 * tells them apart, so it renders on the report itself rather than in the orders footer, and
 * it disappears on its own: the handle stops reporting progress the moment the lane's
 * continuation cursor is cleared, which is exactly when the range is complete.
 */
export function ReportsSyncProgress({ lane = 'sales' }: { lane?: 'sales' | 'comparison' } = {}) {
	const { handle, comparisonHandle } = useReportsHandles();
	const source = lane === 'comparison' ? comparisonHandle : handle;
	const { ready, laneProgress } = useQueryHandleFields(source, ['laneProgress']);
	// Nothing to report before the read has answered: the line speaks for rows that are here.
	const progress = ready ? laneProgress : null;
	const t = useT();

	if (!progress) return null;
	// The comparison lane's download: its figures are not final until it ends.
	const comparison = lane === 'comparison';

	const percent =
		progress.total === null || progress.total <= 0
			? null
			: Math.min(100, Math.round((progress.downloaded / progress.total) * 100));

	return (
		<View
			testID={comparison ? 'reports-comparison-sync-progress' : 'reports-sync-progress'}
			className={`border-border bg-muted/40 gap-1 rounded-md border px-2 py-1 ${comparison ? '' : 'mx-2 mb-1'}`}
		>
			<Text testID="reports-sync-progress-label" className="text-muted-foreground text-sm">
				{progress.total === null
					? t(
							comparison
								? 'reports.comparison_downloading_unknown_total'
								: 'reports.downloading_orders_unknown_total',
							{ downloaded: progress.downloaded }
						)
					: t(comparison ? 'reports.comparison_downloading' : 'reports.downloading_orders', {
							downloaded: progress.downloaded,
							total: progress.total,
						})}
			</Text>
			{percent === null ? null : (
				<View className="bg-muted h-1 w-full overflow-hidden rounded-full">
					<View
						testID="reports-sync-progress-bar"
						accessibilityValue={{ now: percent, min: 0, max: 100 }}
						className="bg-primary h-full rounded-full"
						style={{ width: `${percent}%` }}
					/>
				</View>
			)}
		</View>
	);
}
