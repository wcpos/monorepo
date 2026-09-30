import * as React from 'react';
import { View } from 'react-native';

import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';

import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';

import type { PanelSpec } from './specs';

type Row = PanelSpec['rows'][number];
// A table row is one line of text in a min-h-row; a phone block is the first cell plus a
// label/value pair per remaining column. Estimates only steer the list's first layout.
const TABLE_ROW_SIZE = 44;
const PHONE_ROW_SIZE = 120;

/**
 * The rows go through the shared virtualized list (the project's list rule): a broad range's
 * product or refund report can hold thousands of rows, and a plain ScrollView would mount
 * every one of them when the panel opens. The head and the total stay outside the list.
 */
export function ReportRows({ spec, testID }: { spec: PanelSpec; testID: string }) {
	const { screenSize } = useTheme(),
		t = useT();
	if (!spec.rows.length) return <Text>{t('reports.no_rows_in_period')}</Text>;
	if (screenSize === 'sm')
		return (
			<View testID={testID} className="min-h-0 flex-1">
				<VirtualizedList.Root className="min-h-0 flex-1">
					<VirtualizedList.List
						data={spec.rows}
						estimatedItemSize={PHONE_ROW_SIZE}
						keyExtractor={(row: Row) => String(row.key)}
						parentProps={{ style: { flexGrow: 1, flexShrink: 1, flexBasis: 0 } }}
						renderItem={({ item: row }: { item: Row }) => (
							<VirtualizedList.Item>
								<View testID={`${testID}-row-${row.key}`} className="gap-2 border-b py-3">
									<Text className="font-semibold">{row.cells[0]}</Text>
									{row.cells.slice(1).map((cell, index) => (
										<View key={index} className="flex-row justify-between gap-3">
											<Text
												testID={`${testID}-head-${spec.keys[index + 1]}`}
												className="text-muted-foreground"
											>
												{spec.head[index + 1]}
											</Text>
											<Text className="min-w-0 shrink text-right tabular-nums">{cell}</Text>
										</View>
									))}
								</View>
							</VirtualizedList.Item>
						)}
					/>
				</VirtualizedList.Root>
				{spec.total && (
					// Every total with its label: a report with the margin columns has three beside
					// the amount, and the amount must never give way to a percentage.
					<View testID={`${testID}-total`} className="gap-2 pt-3">
						<Text className="font-semibold">{spec.total[0]}</Text>
						{spec.total.slice(1).map((cell, index) =>
							cell ? (
								<View key={index} className="flex-row justify-between gap-3">
									<Text className="text-muted-foreground">{spec.head[index + 1]}</Text>
									<Text className="min-w-0 shrink text-right font-semibold tabular-nums">
										{cell}
									</Text>
								</View>
							) : null
						)}
					</View>
				)}
			</View>
		);
	const cells = (values: string[], bold = false) =>
		values.map((cell, index) => (
			<TableCell key={index}>
				<Text
					className={`${spec.align[index] === 'right' ? 'text-right tabular-nums' : ''} ${bold ? 'font-semibold' : ''}`}
				>
					{cell}
				</Text>
			</TableCell>
		));
	return (
		<Table testID={testID} className="flex h-full flex-col">
			<TableHeader>
				<TableRow>
					{spec.head.map((label, index) => (
						<TableHead key={index} testID={`${testID}-head-${spec.keys[index]}`}>
							<Text className={spec.align[index] === 'right' ? 'text-right' : 'text-left'}>
								{label}
							</Text>
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<VirtualizedList.Root style={{ flex: 1 }}>
				<VirtualizedList.List
					data={spec.rows}
					estimatedItemSize={TABLE_ROW_SIZE}
					keyExtractor={(row: Row) => String(row.key)}
					parentComponent={TableBody as unknown as typeof View}
					renderItem={({ item: row }: { item: Row }) => (
						<VirtualizedList.Item>
							<TableRow testID={`${testID}-row-${row.key}`}>{cells(row.cells)}</TableRow>
						</VirtualizedList.Item>
					)}
				/>
			</VirtualizedList.Root>
			{spec.total && (
				<TableFooter>
					<TableRow testID={`${testID}-total`}>{cells(spec.total, true)}</TableRow>
				</TableFooter>
			)}
		</Table>
	);
}
