import * as React from 'react';
import { View } from 'react-native';

import Svg, { Circle, G } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod } from '../context';
import { useReportFormats } from '../use-report-formats';

type Part = {
	key: string;
	label: string;
	note?: string;
	value: number;
	valueText: string;
	shareText: string;
};
export function Donut({
	parts,
	centre,
	testID,
}: {
	parts: Part[];
	centre: { figure: string; label: string };
	testID: string;
}) {
	const t = useT(),
		{ storeId } = useReportsPeriod(),
		{ money, percent } = useReportFormats(storeId);
	// The period denominator also includes amounts not represented by a category/register.
	// Read its formats here so Other is formatted from numbers, never parsed from display text.
	const { totals } = useReportsData();
	const colors = useCSSVariable([
		'--color-c1',
		'--color-c2',
		'--color-c3',
		'--color-c4',
		'--color-c5',
		'--color-foreground',
		'--color-muted-foreground',
	]).map(String);
	const [width, setWidth] = React.useState(0);
	const other = parts.slice(5).reduce((sum, part) => sum + part.value, 0);
	const rows =
		parts.length > 5
			? [
					...parts.slice(0, 5),
					{
						key: 'other',
						label: t('common.other'),
						value: other,
						valueText: money(other),
						shareText: t('reports.percent', {
							value: percent(totals.total ? (other / totals.total) * 100 : 0),
						}),
					},
				]
			: parts;
	// r 46 with a 20 stroke leaves a 72-point hole for the centre figure and its label.
	const circumference = 2 * Math.PI * 46;
	return (
		<View
			testID={testID}
			onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
			className={width < 360 ? 'gap-3' : 'flex-row items-center gap-3'}
		>
			<View
				className="relative items-center justify-center self-center"
				style={{ width: 120, height: 120 }}
			>
				<Svg width={120} height={120} viewBox="0 0 120 120">
					{/* A transform attribute, not rotation/origin: those emit transform-origin on web. */}
					<G transform="rotate(-90 60 60)">
						{rows.map((part, index) => {
							const share = totals.total ? part.value / totals.total : 0;
							const before = rows.slice(0, index).reduce((sum, row) => sum + row.value, 0);
							return (
								<Circle
									key={part.key}
									r={46}
									cx={60}
									cy={60}
									strokeWidth={20}
									fill="none"
									stroke={colors[index < 5 ? index : 4]}
									strokeDasharray={[Math.max(2, circumference * share - 2), circumference]}
									strokeDashoffset={totals.total ? (-circumference * before) / totals.total : 0}
								/>
							);
						})}
					</G>
				</Svg>
				{/* Above the SVG: on web the ring otherwise paints over the text's edges. */}
				<View className="absolute inset-0 z-10 items-center justify-center">
					<Text
						testID={`${testID}-figure`}
						numberOfLines={1}
						className="text-sm font-semibold tabular-nums"
					>
						{centre.figure}
					</Text>
					<Text numberOfLines={1} className="text-muted-foreground text-xs">
						{centre.label}
					</Text>
				</View>
			</View>
			<View className="flex-1 gap-2">
				{rows.map((part, index) => (
					<View
						key={part.key}
						testID={`${testID}-row-${part.key}`}
						className="flex-row items-center gap-2"
					>
						<View className="size-2.5" style={{ backgroundColor: colors[index < 5 ? index : 4] }} />
						<View className="min-w-0 flex-1">
							<Text numberOfLines={1}>{part.label}</Text>
							{part.note && <Text className="text-muted-foreground text-xs">{part.note}</Text>}
						</View>
						<Text testID={`${testID}-row-${part.key}-value`} className="font-semibold tabular-nums">
							{part.valueText}
						</Text>
						<Text className="text-muted-foreground w-16 text-right">{part.shareText}</Text>
					</View>
				))}
			</View>
		</View>
	);
}
