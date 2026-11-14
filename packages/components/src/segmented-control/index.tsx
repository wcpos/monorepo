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
import { TextClassContext } from '../text/context';

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
	/**
	 * In a row (a header beside a title or a close), say `hug`: Yoga gives an auto-width container
	 * with growing children the whole row; in a column the control stretches to the column and the
	 * segments share it equally.
	 */
	hug?: boolean;
};

export type SegmentedControlHandle = { focus: () => void };

export function SegmentedControl({
	segments,
	value,
	onValueChange,
	testID,
	className,
	ref,
	hug,
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
						'min-w-ctl web:hover:bg-accent flex-row items-center justify-center gap-1.5 px-3 py-1.5 active:opacity-70',
						// Equal shares of a definite width; `hug`: content width on native (basis auto,
						// shrinking to truncate), where growing segments would take the whole row.
						hug ? 'web:flex-1 native:shrink native:grow-0' : 'flex-1',
						index > 0 && 'border-border border-l',
						// The selected choice is the tinted block (the `--selected` pair, as a Chip's `on`).
						segment.value === value && 'bg-selected web:hover:bg-selected',
						segment.disabled && 'opacity-45'
					)}
				>
					<TextClassContext.Provider
						// One weight in both states: selection never changes weight (2026-10-30). The weight
						// rides the context with the ink, so the label's own literal is only its size.
						value={cn(
							'font-medium',
							segment.value === value ? 'text-selected-foreground' : 'text-muted-foreground'
						)}
					>
						{segment.icon && <Icon name={segment.icon} />}
						<Text className="shrink text-center text-base">{segment.label}</Text>
					</TextClassContext.Provider>
				</Pressable>
			))}
		</View>
	);
}
