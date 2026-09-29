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

import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';

import type { PanelSpec } from './specs';

export function ReportRows({ spec, testID }: { spec: PanelSpec; testID: string }) {
	const { screenSize } = useTheme(),
		t = useT();
	if (!spec.rows.length) return <Text>{t('reports.no_rows_in_period')}</Text>;
	if (screenSize === 'sm')
		return (
			<View testID={testID} className="gap-4">
				{spec.rows.map((row) => (
					<View key={row.key} testID={`${testID}-row-${row.key}`} className="gap-2 border-b pb-3">
						<Text className="font-semibold">{row.cells[0]}</Text>
						{row.cells.slice(1).map((cell, index) => (
							<View key={index} className="flex-row justify-between gap-3">
								<Text className="text-muted-foreground">{spec.head[index + 1]}</Text>
								<Text className="min-w-0 shrink text-right tabular-nums">{cell}</Text>
							</View>
						))}
					</View>
				))}
				{spec.total && (
					<View testID={`${testID}-total`} className="flex-row justify-between gap-3">
						<Text className="min-w-0 shrink font-semibold">{spec.total[0]}</Text>
						<Text className="text-right font-semibold tabular-nums">
							{spec.total.filter(Boolean).at(-1)}
						</Text>
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
		<Table testID={testID}>
			<TableHeader>
				<TableRow>
					{spec.head.map((label, index) => (
						<TableHead key={index}>
							<Text className={spec.align[index] === 'right' ? 'text-right' : 'text-left'}>
								{label}
							</Text>
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{spec.rows.map((row) => (
					<TableRow key={row.key} testID={`${testID}-row-${row.key}`}>
						{cells(row.cells)}
					</TableRow>
				))}
			</TableBody>
			{spec.total && (
				<TableFooter>
					<TableRow testID={`${testID}-total`}>{cells(spec.total, true)}</TableRow>
				</TableFooter>
			)}
		</Table>
	);
}
