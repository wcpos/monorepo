import * as React from 'react';
import { Platform, Pressable, type PressableProps, View } from 'react-native';

import { Icon, type IconName } from '../icon';
import { MinTargetBand } from '../lib/min-target';
import { cn } from '../lib/utils';
import { Text } from '../text';

type ChipProps = Omit<PressableProps, 'children'> & {
	label: string;
	icon?: IconName;
	/** A node in the icon's place, e.g. the cart customer's Avatar; wins over `icon`. */
	leading?: React.ReactNode;
	/** A number beside the label, or its own text (`+3`). */
	count?: number | string;
	on?: boolean;
	dimmed?: boolean;
	add?: boolean;
	onLongPress?: PressableProps['onLongPress'];
	onClear?: () => void;
	clearLabel?: string;
	clearTestID?: string;
	/**
	 * A trailing cell after a hairline with its own press, e.g. the cart customer's address
	 * editor beside the picker (owner, 2026-10-22). It takes the clear control's place, so
	 * `onClear` is ignored when both are given. `muted` greys the glyph when it has nothing yet.
	 */
	action?: {
		icon: IconName;
		onPress: () => void;
		accessibilityLabel: string;
		testID?: string;
		muted?: boolean;
	};
	/**
	 * `sm` (32) is for a dense table cell or a row's filter strip, the smallest a tap target
	 * may be there; `default` (44, the control token) everywhere else. Same radius, border and
	 * on-state at both sizes (ruled 2026-10-16, decision 10).
	 */
	size?: 'default' | 'sm';
};

/**
 * The selected state is announced, not only drawn: `on` is a choice, so assistive tech hears
 * which preset is picked (the health chip this replaced carried it). A chip is a button, and
 * on the web a button's toggle state is `aria-pressed` (`aria-selected` is not allowed on the
 * button role); native platforms announce it as `selected`.
 */
function selectedState(on: boolean | undefined) {
	if (on === undefined) return {};
	return Platform.OS === 'web' ? { 'aria-pressed': on } : { 'aria-selected': on };
}

// Every variant carries the same root classes; a cell that renders full-width is a stale
// baseline, not a prop-dependent layout (measured on wcpos/monorepo#2189).
export function Chip({
	label,
	icon,
	leading,
	count,
	on,
	dimmed,
	add,
	onClear: clearProp,
	clearLabel,
	clearTestID,
	action,
	size = 'default',
	disabled,
	testID,
	className,
	onPress,
	onLongPress,
	...props
}: ChipProps) {
	// A boolean, never undefined: Android keeps a view accessibility-disabled when the
	// state key is absent, which is what `button` ledger line 1 records.
	const inactive = !!(disabled || dimmed);
	const contextMenu =
		Platform.OS === 'web' && onLongPress
			? ({
					onContextMenu: (event: Parameters<NonNullable<PressableProps['onLongPress']>>[0]) => {
						if (inactive || event.defaultPrevented) return;
						event.preventDefault();
						onLongPress(event);
					},
				} as PressableProps)
			: {};
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	const sm = size === 'sm';
	const onClear = action ? undefined : clearProp;
	// The trailing cell's press: the action's, or the clear control's. Either makes the chip split.
	const trail = action?.onPress ?? onClear;
	// `sm` is drawn under 44 for a dense cell; each press target still gets 44 (§ Design 2).
	const band = sm && <MinTargetBand />;
	const content = (
		<>
			{leading ??
				(icon && (
					<Icon name={icon} className={on ? 'text-selected-foreground' : 'text-foreground'} />
				))}
			<Text
				testID={trail ? undefined : id('label')}
				// One line: a long label (a customer's full name) truncates inside the pill
				// instead of pushing the pill over the controls beside it.
				numberOfLines={1}
				className={cn(
					'shrink font-medium',
					sm ? 'text-sm' : 'text-base',
					add ? 'text-muted-foreground' : 'text-foreground',
					on && 'text-selected-foreground font-semibold'
				)}
			>
				{label}
			</Text>
			{count !== undefined && (
				<View className="bg-background min-w-5 items-center rounded-full px-1">
					<Text testID={id('count')} className="text-foreground text-xs font-bold">
						{count}
					</Text>
				</View>
			)}
		</>
	);
	return (
		<Pressable
			{...props}
			testID={testID}
			disabled={inactive}
			// With a trailing cell the chip is a container: the label half takes the press, so
			// the handler and the focus live there and never fire twice from one tap.
			onPress={trail ? undefined : onPress}
			onLongPress={onLongPress}
			{...contextMenu}
			role={trail ? undefined : 'button'}
			{...(trail ? {} : selectedState(on))}
			tabIndex={trail ? -1 : 0}
			accessible={trail ? false : undefined}
			className={cn(
				// `self-start`: a pill hugs its label. A View stretches across a column parent by
				// default, which turned the chip into a full-width bar outside a filter row; the
				// drawn chip is inline-flex.
				'bg-card max-w-full flex-row items-center gap-1.5 self-start rounded-full border',
				sm ? 'h-8 px-2.5' : 'h-ctl px-3',
				// With an action each cell fills on its own (the strip rule, 2026-10-09), so the
				// label half carries the padding and the pill neither fills nor pads.
				action ? 'gap-0 px-0' : 'active:bg-muted web:hover:bg-muted',
				on && 'active:bg-selected web:hover:bg-selected',
				on ? 'bg-selected border-selected' : 'border-border',
				add && 'border-dashed',
				dimmed && 'opacity-45',
				className
			)}
		>
			{trail ? (
				<>
					<Pressable
						testID={id('label')}
						onLongPress={onLongPress}
						{...contextMenu}
						role="button"
						{...selectedState(on)}
						disabled={inactive}
						className={cn(
							'flex-1 flex-row items-center gap-1.5 self-stretch',
							!action
								? 'active:opacity-70'
								: cn(
										'active:bg-muted web:hover:bg-muted rounded-l-full',
										on && 'active:bg-selected web:hover:bg-selected',
										sm ? 'px-2.5' : 'px-3'
									)
						)}
						// The label's press bubbles: with a trailing cell the root has no handler, so
						// nothing fires twice, and a menu trigger wrapping the chip (`asChild`) listens
						// on the root's DOM node on web. Stopping it here made a selected filter
						// impossible to reopen. Only the clear control stops its own press.
						onPress={(event) => {
							onPress?.(event);
						}}
					>
						{content}
						{band}
					</Pressable>
					<Pressable
						role="button"
						disabled={inactive}
						testID={action ? (action.testID ?? id('action')) : (clearTestID ?? id('clear'))}
						accessibilityLabel={action ? action.accessibilityLabel : (clearLabel ?? 'Remove')}
						className={cn(
							'items-center justify-center self-stretch',
							// The trailing cell spans the chip's height and as much width, so it is never
							// smaller than the chip's own target (line 8); the clear control's negative
							// margin cancels the chip's end padding (an action chip has none).
							action
								? cn(
										'border-border active:bg-muted web:hover:bg-muted rounded-r-full border-l',
										on && 'active:bg-selected web:hover:bg-selected',
										sm ? 'min-w-8' : 'min-w-ctl'
									)
								: cn('active:opacity-70', sm ? '-mr-2.5 min-w-8' : 'min-w-ctl -mr-3')
						)}
						onPress={(event) => {
							event?.stopPropagation?.();
							trail();
						}}
						// A web Select trigger (`asChild`) opens from the ROOT's mouse pointerdown, which
						// stopping the press never reaches: clearing a select pill also opened its menu
						// over the screen (#2284). Enter/Space already stop at this press's own keydown.
						onPointerDown={(event) => event.stopPropagation()}
					>
						{action ? (
							<Icon
								name={action.icon}
								className={
									action.muted
										? 'text-muted-foreground'
										: on
											? 'text-selected-foreground'
											: 'text-foreground'
								}
							/>
						) : (
							<Icon
								name="close"
								size="sm"
								className={on ? 'text-selected-foreground' : 'text-foreground'}
							/>
						)}
						{band}
					</Pressable>
				</>
			) : (
				<>
					{content}
					{band}
				</>
			)}
		</Pressable>
	);
}
