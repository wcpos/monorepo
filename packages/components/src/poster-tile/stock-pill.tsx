import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '../icon';
import { Text } from '../text';
import { TextClassContext } from '../text/context';

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
				<TextClassContext.Provider value={tone}>
					<Icon name="product" size="xs" />
					<Text className="text-xs font-bold tabular-nums">{props.value}</Text>
				</TextClassContext.Provider>
			</View>
		);
	}
	return (
		<View
			className={`${PILL} bg-card border-border border`}
			accessibilityLabel={label}
			testID={testID}
		>
			<Icon name="pending" size="xs" className="text-muted-foreground" />
			<Text variant="help" className="font-bold">
				{label}
			</Text>
		</View>
	);
}
