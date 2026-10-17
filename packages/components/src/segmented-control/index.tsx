import * as React from 'react';
import {
	type KeyDownEvent,
	Platform,
	Pressable,
	View,
	type ViewInstance,
	type ViewProps,
} from 'react-native';

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
	/**
	 * `focus()` moves focus to the group's tab stop (the selected segment, or the first enabled
	 * one), which is what a form field's focus-on-error needs; the root view is not focusable.
	 */
	ref?: React.Ref<SegmentedControlHandle>;
	segments:
		| readonly [Segment, Segment]
		| readonly [Segment, Segment, Segment]
		| readonly [Segment, Segment, Segment, Segment];
	value: string;
	onValueChange: (value: string) => void;
};

export type SegmentedControlHandle = { focus: () => void };

export function SegmentedControl({
	segments,
	value,
	onValueChange,
	testID,
	className,
	ref,
	...props
}: SegmentedControlProps) {
	const refs = React.useRef<Record<string, ViewInstance | null>>({});
	// One tab stop, and never on a disabled segment: the selected one when it is enabled,
	// otherwise the first enabled one; a fully disabled group leaves the tab order.
	const selected = segments.find((segment) => segment.value === value && !segment.disabled);
	const tabStop = (selected ?? segments.find((segment) => !segment.disabled))?.value;
	React.useImperativeHandle(ref, () => ({
		focus: () => {
			if (tabStop !== undefined) refs.current[tabStop]?.focus();
		},
	}));
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	const choose = (next: string) => {
		if (next && next !== value) onValueChange(next);
	};
	const onKeyDown = (event: React.KeyboardEvent | KeyDownEvent, from: string) => {
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
		const key = 'key' in event ? event.key : event.nativeEvent.key;
		const target = enabled[destinations[key]];
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
			// `min-h`, not `h`: a label that wraps (German, a phone-width form) grows the control
			// instead of being clipped by `overflow-hidden`; one-line labels keep it at 44.
			className={cn(
				'min-h-ctl border-border bg-card flex-row overflow-hidden rounded-lg border',
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
					disabled={!!segment.disabled}
					tabIndex={segment.value === tabStop ? 0 : -1}
					testID={segment.testID ?? id(`segment-${segment.value}`)}
					onPress={() => choose(segment.value)}
					{...{
						onKeyDown: (event: React.KeyboardEvent | KeyDownEvent) =>
							onKeyDown(event, segment.value),
					}}
					className={cn(
						'min-w-ctl web:hover:bg-muted flex-1 flex-row items-center justify-center gap-1.5 px-3 py-1.5 active:opacity-70',
						index > 0 && 'border-border border-l',
						segment.value === value && 'bg-muted',
						segment.disabled && 'opacity-45'
					)}
				>
					{segment.icon && <Icon name={segment.icon} className="text-foreground" />}
					<Text
						className={cn(
							'shrink text-center text-base',
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
