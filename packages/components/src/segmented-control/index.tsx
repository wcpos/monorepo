import * as React from 'react';
import { Platform, Pressable, View, type ViewProps } from 'react-native';

import { Icon, type IconName } from '../icon';
import { cn } from '../lib/utils';
import { Text } from '../text';

export type Segment = {
	value: string;
	label: string;
	icon?: IconName;
	disabled?: boolean;
	testID?: string;
};
type SegmentedControlProps = ViewProps & {
	segments:
		| readonly [Segment, Segment]
		| readonly [Segment, Segment, Segment]
		| readonly [Segment, Segment, Segment, Segment];
	value: string;
	onValueChange: (value: string) => void;
};

export function SegmentedControl({
	segments,
	value,
	onValueChange,
	testID,
	className,
	...props
}: SegmentedControlProps) {
	const refs = React.useRef<Record<string, View | null>>({});
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	const choose = (next: string) => {
		if (next && next !== value) onValueChange(next);
	};
	const onKeyDown = (event: React.KeyboardEvent, from: string) => {
		if (Platform.OS !== 'web') return;
		const enabled = segments.filter((segment) => !segment.disabled);
		const index = enabled.findIndex((segment) => segment.value === from);
		const destinations: Record<string, number> = {
			ArrowRight: (index + 1) % enabled.length,
			ArrowDown: (index + 1) % enabled.length,
			ArrowLeft: (index - 1 + enabled.length) % enabled.length,
			ArrowUp: (index - 1 + enabled.length) % enabled.length,
			Home: 0,
			End: enabled.length - 1,
		};
		const target = enabled[destinations[event.key]];
		if (!target) return;
		event.preventDefault();
		choose(target.value);
		refs.current[target.value]?.focus();
	};
	return (
		<View
			{...props}
			testID={testID}
			role="radiogroup"
			className={cn(
				'h-ctl border-border bg-card flex-row overflow-hidden rounded-lg border',
				className
			)}
		>
			{segments.map((segment, index) => (
				<Pressable
					key={segment.value}
					ref={(node) => {
						refs.current[segment.value] = node;
					}}
					role="radio"
					aria-checked={segment.value === value}
					disabled={segment.disabled}
					tabIndex={segment.value === value ? 0 : -1}
					testID={segment.testID ?? id(`segment-${segment.value}`)}
					onPress={() => choose(segment.value)}
					{...{ onKeyDown: (event: React.KeyboardEvent) => onKeyDown(event, segment.value) }}
					className={cn(
						'min-w-ctl web:hover:bg-muted flex-1 flex-row items-center justify-center gap-1.5 px-3 active:opacity-70',
						index > 0 && 'border-border border-l',
						segment.value === value && 'bg-muted',
						segment.disabled && 'opacity-45'
					)}
				>
					{segment.icon && <Icon name={segment.icon} className="text-foreground" />}
					<Text
						className={cn(
							'text-base',
							segment.value === value
								? 'text-foreground font-semibold'
								: 'text-muted-foreground font-medium'
						)}
					>
						{segment.label}
					</Text>
				</Pressable>
			))}
		</View>
	);
}
