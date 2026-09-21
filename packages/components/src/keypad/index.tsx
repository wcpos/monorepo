import { Pressable, View, type ViewProps } from 'react-native';

import { HStack } from '../hstack';
import { Icon, type IconName } from '../icon';
import { cn } from '../lib/utils';
import { Text } from '../text';

export type KeypadKeyDescriptor = {
	value: string;
	label?: string;
	icon?: IconName;
	testID?: string;
	// An icon-only key carries no name of its own and the string is the caller's to
	// translate; the machine value is not a name (the page-bar review's lesson, #2188).
	accessibilityLabel?: string;
	span?: 2;
	disabled?: boolean;
};
type KeypadProps = ViewProps & {
	rows: readonly (readonly KeypadKeyDescriptor[])[];
	onPress: (value: string) => void;
	fit?: 'tile' | 'shrink';
};

export function Keypad({ rows, onPress, fit = 'tile', testID, className, ...props }: KeypadProps) {
	const shrink = fit === 'shrink';
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	return (
		<View {...props} testID={testID} className={cn('gap-2', shrink && 'min-h-0 flex-1', className)}>
			{rows.map((row, index) => (
				<HStack key={index} className={cn('items-stretch gap-2', shrink && 'min-h-ctl flex-1')}>
					{row.map((key) => (
						<Pressable
							key={key.value}
							role="button"
							disabled={key.disabled}
							testID={key.testID ?? id(`key-${key.value}`) ?? `keypad-key-${key.value}`}
							accessibilityLabel={key.accessibilityLabel ?? key.label ?? key.value}
							onPress={() => onPress(key.value)}
							className={cn(
								'border-border bg-card active:bg-muted web:hover:bg-muted flex-1 items-center justify-center rounded-lg border',
								shrink ? 'min-h-ctl' : 'h-tile',
								key.span === 2 && 'flex-[2]',
								key.disabled && 'opacity-45'
							)}
						>
							{key.icon ? (
								<Icon name={key.icon} size="lg" className="text-foreground" />
							) : (
								<Text className="text-base font-medium">{key.label}</Text>
							)}
						</Pressable>
					))}
				</HStack>
			))}
		</View>
	);
}
