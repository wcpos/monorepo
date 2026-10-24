import * as React from 'react';
import { type KeyDownEvent, Pressable, View, type ViewInstance } from 'react-native';

import { Button, ButtonText } from '../button';
import { Icon, type IconName } from '../icon';
import { isWeb, useOverlayPresentation } from '../lib/overlay';
import { cn } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Text } from '../text';
import { EMPTY_ENTRY, quantityEntryReducer, typedQuantity } from './reducer';

import type { TriggerRef } from '@rn-primitives/popover';

/** Material's minimum touch target (decision 36): the anchored panel is a 3 × 5 grid of them. */
const CELL = 48;
const CELL_STYLE = { width: CELL, height: CELL };
/** Five rows; below the box when they fit in the window, above it when they do not. */
const PANEL_HEIGHT = CELL * 5;
// A step lands on the 3-place grid (the reducer's floor): 1.1 + 1 is 2.1, not 2.1000000000000005.
const onGrid = (quantity: number) => Math.round(quantity * 1000) / 1000;
const DIGIT_ROWS = ['123', '456', '789'].map((row) => [...row].map((d) => ({ name: d, label: d })));
/** A physical key's name on the pad; a digit is its own name. */
const KEY_NAMES: Record<string, string> = {
	Backspace: 'backspace',
	Enter: 'done',
	ArrowUp: 'increase',
	ArrowDown: 'decrease',
};

type Grow = 'down' | 'up';
type Key = { name: string; label: string; icon?: IconName; variant?: 'destructive' | 'primary' };

export type QuantityKeypadLabels = {
	decrease: string;
	increase: string;
	remove: string;
	backspace: string;
	done: string;
};

export type QuantityKeypadProps = {
	/** The line's quantity as stored. */
	value: number;
	/** The store's number format (separators). */
	format: (value: number) => string;
	/**
	 * A committed quantity: at least 1, or a fraction of at least 0.001. Resolving `false`
	 * says the store refused it (the stock guard), and a − or + step is taken back.
	 */
	onChange: (quantity: number) => void | boolean | Promise<void | boolean>;
	/** − pressed at 1 (the trash). */
	onRemove: () => void;
	disabled?: boolean;
	/** The store's decimal separator: the physical key that types a fraction. */
	decimalSeparator?: string;
	labels: QuantityKeypadLabels;
	/** On the trigger, unchanged. */
	testID?: string;
	className?: string;
	textClassName?: string;
	/** Told when the keypad opens and closes. */
	onOpenChange?: (open: boolean) => void;
	ref?: React.Ref<QuantityKeypadHandle>;
};

export type QuantityKeypadHandle = {
	/** Opens the keypad, as a press does. */
	focus: () => void;
	/** Closes it keeping the stored quantity, as Escape does. */
	dismiss: () => void;
};

/**
 * The cart quantity box that grows into its keypad (decision 36): the number stays where it
 * was, − to its left, + to its right, the keys beneath. On a phone the popover is the sheet.
 */
export function QuantityKeypad({
	value,
	format,
	onChange,
	onRemove,
	disabled = false,
	decimalSeparator = '.',
	labels,
	testID,
	className,
	textClassName,
	onOpenChange: onOpenChangeProp,
	ref,
}: QuantityKeypadProps) {
	const trigger = React.useRef<TriggerRef>(null);
	const panel = React.useRef<ViewInstance>(null);
	const [entry, dispatch] = React.useReducer(quantityEntryReducer, EMPTY_ENTRY);
	const [frame, setFrame] = React.useState({ open: false, grow: 'down' as Grow, offset: 0 });
	// Escape is the one close that keeps the stored quantity; every other close commits.
	const discard = React.useRef(false);
	const isOpen = React.useRef(false);
	const close = () => trigger.current?.close();
	const dismiss = () => {
		discard.current = true;
		close();
	};
	React.useImperativeHandle(ref, () => ({
		focus: () => !disabled && trigger.current?.open(),
		dismiss,
	}));
	// A pointer press leaves focus on the key; back on the panel, the next Enter is Done.
	const focusPanel = () =>
		isWeb && (panel.current as unknown as HTMLElement | null)?.focus({ preventScroll: true });

	const base = typedQuantity(entry.buffer) ?? entry.stepped ?? value;
	const trash = base <= 1;
	const step = (quantity: number) => {
		dispatch({ type: 'step', quantity });
		const unstep = () => dispatch({ type: 'unstep', quantity });
		void Promise.resolve(onChange(quantity)).then((ok) => ok === false && unstep(), unstep);
	};

	const onOpenChange = (open: boolean) => {
		if (open === isOpen.current) return;
		isOpen.current = open;
		onOpenChangeProp?.(open);
		if (open) {
			discard.current = false;
			// Measured once per open: the first row's middle cell sits over the box.
			const box = (trigger.current as unknown as HTMLElement | null)?.getBoundingClientRect?.();
			const height = box?.height ?? 0;
			const inset = (CELL - height) / 2;
			const fits = !box || box.top - inset + PANEL_HEIGHT <= window.innerHeight;
			setFrame({ open, grow: fits ? 'down' : 'up', offset: -(height + inset) });
		} else {
			const typed = typedQuantity(entry.buffer);
			const shown = entry.stepped ?? value;
			// The write presents its own failure (a toast) and the keypad is already closed.
			if (!discard.current && typed !== undefined && typed !== shown)
				void Promise.resolve(onChange(typed)).catch(() => undefined);
			setFrame((current) => ({ ...current, open }));
		}
		dispatch({ type: 'reset' });
	};

	const press = (name: string) => {
		if (name === 'done') return close();
		if (name === 'decrease' && trash) {
			// The line goes: nothing typed is committed on the way out.
			dismiss();
			return onRemove();
		}
		if (name === 'backspace') dispatch({ type: 'backspace' });
		else if (name === 'increase') step(onGrid(base + 1));
		else if (name === 'decrease') step(onGrid(base - 1));
		else dispatch({ type: 'digit', digit: name });
		focusPanel();
	};

	// Web: the physical keyboard while the panel holds focus.
	const onKeyDown = (event: KeyDownEvent) => {
		const { key } = event.nativeEvent;
		if (key === 'Escape') {
			discard.current = true;
			return;
		}
		// A focused key takes its own Enter; the panel's Enter is Done.
		if (key === 'Enter' && event.target !== event.currentTarget) return;
		const name = /^[0-9]$/.test(key) ? key : KEY_NAMES[key];
		// Both: a numeric keypad types '.' on a ',' store.
		if (key === '.' || key === ',' || key === decimalSeparator) dispatch({ type: 'decimal' });
		// A held ArrowDown stops at 1; only a press on the trash removes the line.
		else if (name && !(key === 'ArrowDown' && trash)) press(name);
		else if (!name) return;
		event.preventDefault();
	};

	const display = entry.buffer
		? entry.buffer.replace('.', decimalSeparator)
		: format(entry.stepped ?? value);
	const stepper: (Key | null)[] = [
		trash
			? { name: 'decrease', label: labels.remove, icon: 'delete', variant: 'destructive' }
			: { name: 'decrease', label: labels.decrease, icon: 'minus' },
		null,
		{ name: 'increase', label: labels.increase, icon: 'plus' },
	];
	const last: Key[] = [
		{ name: 'backspace', label: labels.backspace, icon: 'backspace' },
		{ name: '0', label: '0' },
		{ name: 'done', label: labels.done, icon: 'check', variant: 'primary' },
	];

	return (
		<Popover onOpenChange={onOpenChange}>
			<PopoverTrigger ref={trigger} asChild disabled={disabled}>
				<Button
					testID={testID}
					variant="outline"
					disabled={disabled}
					className={cn('min-w-10 items-start', className)}
				>
					<ButtonText className={textClassName}>{format(value)}</ButtonText>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="center"
				side={frame.grow === 'up' ? 'top' : 'bottom'}
				sideOffset={frame.offset}
				avoidCollisions={false}
				onEscapeKeyDown={() => {
					discard.current = true;
				}}
				// The panel takes the keys, not its first key: Enter is Done, never a press of −.
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					(panel.current as unknown as HTMLElement | null)?.focus({ preventScroll: true });
				}}
				{...({ dataSet: { grow: frame.grow } } as object)}
				className={cn(
					'w-auto overflow-hidden p-0',
					frame.open &&
						(frame.grow === 'up' ? 'web:animate-quantity-grow-up' : 'web:animate-quantity-grow')
				)}
			>
				<Keys
					panel={panel}
					rows={[stepper, ...DIGIT_ROWS, last]}
					grow={frame.grow}
					display={display}
					textClassName={textClassName}
					onPress={press}
					onKeyDown={onKeyDown}
				/>
			</PopoverContent>
		</Popover>
	);
}

/**
 * The grid: flat 48 px cells under the panel's one border when anchored, the stepper row
 * hairlined off the keys; on the phone sheet, stretched muted keys and Done in ✓'s place.
 */
function Keys({
	panel,
	rows,
	grow,
	display,
	textClassName,
	onPress,
	onKeyDown,
}: {
	panel: React.RefObject<ViewInstance | null>;
	rows: (Key | null)[][];
	grow: Grow;
	display: string;
	textClassName?: string;
	onPress: (name: string) => void;
	onKeyDown: (event: KeyDownEvent) => void;
}) {
	const sheet = useOverlayPresentation() === 'bottom';
	// Growing up, the keys sit above and the stepper row lands on the box.
	const ordered = grow === 'up' && !sheet ? [...rows.slice(1), rows[0]] : rows;
	return (
		<View
			ref={panel}
			// The sheet has no primitive Content to focus it: tabbable, the panel is what the
			// shell focuses once the sheet has risen, so Enter is Done there too, never the −.
			tabIndex={sheet ? 0 : -1}
			onKeyDown={onKeyDown}
			className={cn('web:outline-none', sheet && 'gap-2')}
		>
			{ordered.map((row, index) => {
				const stepperRow = row === rows[0];
				return (
					<View
						key={index}
						className={cn(
							'flex-row',
							sheet && (stepperRow ? 'border-border overflow-hidden rounded-lg border' : 'gap-2'),
							!sheet &&
								stepperRow &&
								(grow === 'up' ? 'border-border border-t' : 'border-border border-b')
						)}
					>
						{row.map((key) =>
							key === null ? (
								<View
									key="value"
									style={sheet ? undefined : CELL_STYLE}
									aria-live="polite"
									className={cn('items-center justify-center', sheet && 'flex-1')}
								>
									<Text
										testID="quantity-keypad-value"
										className={cn(
											'font-semibold tabular-nums',
											sheet ? 'text-xl' : 'text-base',
											textClassName
										)}
									>
										{display}
									</Text>
								</View>
							) : sheet && key.name === 'done' ? (
								<Button
									key="done"
									testID="numpad-done-button"
									className="flex-1"
									onPress={() => onPress('done')}
								>
									{key.label}
								</Button>
							) : (
								<Pressable
									key={key.name}
									role="button"
									testID={key.name === 'done' ? 'numpad-done-button' : `numpad-key-${key.name}`}
									accessibilityLabel={key.label}
									onPress={() => onPress(key.name)}
									style={sheet ? undefined : CELL_STYLE}
									className={cn(
										'web:hover:bg-muted active:bg-muted items-center justify-center',
										sheet &&
											(stepperRow ? 'min-h-ctl w-14' : 'min-h-ctl bg-muted flex-1 rounded-lg')
									)}
								>
									{key.icon ? (
										<Icon name={key.icon} variant={key.variant} />
									) : (
										<Text className={cn('font-semibold', sheet ? 'text-xl' : 'text-lg')}>
											{key.label}
										</Text>
									)}
								</Pressable>
							)
						)}
					</View>
				);
			})}
		</View>
	);
}
