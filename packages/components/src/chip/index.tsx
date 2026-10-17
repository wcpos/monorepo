import { Platform, Pressable, type PressableProps, View } from 'react-native';

import { Icon, type IconName } from '../icon';
import { cn } from '../lib/utils';
import { Text } from '../text';

type ChipProps = Omit<PressableProps, 'children'> & {
	label: string;
	icon?: IconName;
	count?: number;
	on?: boolean;
	dimmed?: boolean;
	add?: boolean;
	onClear?: () => void;
	clearLabel?: string;
	clearTestID?: string;
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

// `sm` is drawn 32 tall for a dense cell; 6 pt of slop on each side keeps the 44 pt target
// (CODING_STANDARDS § Design 2). React Native Web ignores `hitSlop`; a pointer needs none.
const SM_HIT_SLOP = 6;

// Every variant carries the same root classes; a cell that renders full-width is a stale
// baseline, not a prop-dependent layout (measured on wcpos/monorepo#2189).
export function Chip({
	label,
	icon,
	count,
	on,
	dimmed,
	add,
	onClear,
	clearLabel,
	clearTestID,
	size = 'default',
	disabled,
	testID,
	className,
	onPress,
	...props
}: ChipProps) {
	// A boolean, never undefined: Android keeps a view accessibility-disabled when the
	// state key is absent, which is what `button` ledger line 1 records.
	const inactive = !!(disabled || dimmed);
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	const sm = size === 'sm';
	const content = (
		<>
			{icon && <Icon name={icon} className="text-foreground" />}
			<Text
				testID={onClear ? undefined : id('label')}
				// One line: a long label (a customer's full name) truncates inside the pill
				// instead of pushing the pill over the controls beside it.
				numberOfLines={1}
				className={cn(
					'shrink font-medium',
					sm ? 'text-sm' : 'text-base',
					add ? 'text-muted-foreground' : 'text-foreground',
					on && 'text-primary font-semibold'
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
			hitSlop={sm ? SM_HIT_SLOP : undefined}
			{...props}
			testID={testID}
			disabled={inactive}
			// With a clear control the chip is a container: the label half takes the press, so
			// the handler and the focus live there and never fire twice from one tap.
			onPress={onClear ? undefined : onPress}
			role={onClear ? undefined : 'button'}
			{...(onClear ? {} : selectedState(on))}
			tabIndex={onClear ? -1 : 0}
			accessible={onClear ? false : undefined}
			className={cn(
				// `self-start`: a pill hugs its label. A View stretches across a column parent by
				// default, which turned the chip into a full-width bar outside a filter row; the
				// drawn chip is inline-flex.
				'bg-card active:bg-muted web:hover:bg-muted max-w-full flex-row items-center gap-1.5 self-start rounded-full border',
				sm ? 'h-8 px-2.5' : 'h-ctl px-3',
				on ? 'border-primary' : 'border-border',
				add && 'border-dashed',
				dimmed && 'opacity-45',
				className
			)}
		>
			{onClear ? (
				<>
					<Pressable
						testID={id('label')}
						role="button"
						{...selectedState(on)}
						disabled={inactive}
						className="flex-1 flex-row items-center gap-1.5 self-stretch active:opacity-70"
						// The label's press bubbles: with a clear control the root has no handler, so
						// nothing fires twice, and a menu trigger wrapping the chip (`asChild`) listens
						// on the root's DOM node on web. Stopping it here made a selected filter
						// impossible to reopen. Only the clear control stops its own press.
						onPress={(event) => {
							onPress?.(event);
						}}
					>
						{content}
					</Pressable>
					<Pressable
						role="button"
						disabled={inactive}
						testID={clearTestID ?? id('clear')}
						accessibilityLabel={clearLabel ?? 'Remove'}
						hitSlop={8}
						className={cn(
							'items-center justify-center self-stretch active:opacity-70',
							// The clear control spans the chip's height and as much width, so it is never
							// smaller than the chip's own target (line 8); the negative margin cancels the
							// chip's end padding.
							sm ? '-mr-2.5 min-w-8' : 'min-w-ctl -mr-3'
						)}
						onPress={(event) => {
							event?.stopPropagation?.();
							onClear();
						}}
						// A web Select trigger (`asChild`) opens from the ROOT's mouse pointerdown, which
						// stopping the press never reaches: clearing a select pill also opened its menu
						// over the screen (#2284). Enter/Space already stop at this press's own keydown.
						onPointerDown={(event) => event.stopPropagation()}
					>
						<Icon name="xmark" size="sm" className="text-foreground" />
					</Pressable>
				</>
			) : (
				content
			)}
		</Pressable>
	);
}
