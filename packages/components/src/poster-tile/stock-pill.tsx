import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '../icon';
import { Text } from '../text';

const PILL = 'h-5.5 flex-row items-center gap-1 rounded-full px-2';

type StockPillProps = ({ value: number; low?: boolean } | { backorder: true }) & {
	label?: string;
	testID?: string;
};

export function StockPill({ label, testID, ...props }: StockPillProps) {
	if ('value' in props) {
		const tone = props.low ? 'text-warning-foreground' : 'text-foreground';
		return (
			<View
				className={`${PILL} ${props.low ? 'bg-warning' : 'bg-card border-border border'}`}
				accessibilityLabel={label}
				testID={testID}
			>
				<Icon name="box" size="xs" className={tone} />
				<Text className={`text-xs font-bold tabular-nums ${tone}`}>{props.value}</Text>
			</View>
		);
	}
	return (
		<View
			className={`${PILL} bg-card border-border border`}
			accessibilityLabel={label}
			testID={testID}
		>
			<Icon name="clock" size="xs" className="text-muted-foreground" />
			<Text className="text-muted-foreground text-xs font-bold">{label}</Text>
		</View>
	);
}
