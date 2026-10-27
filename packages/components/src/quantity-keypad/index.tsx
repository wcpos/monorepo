import * as React from 'react';

import { Button, ButtonText } from '../button';
import {
	closingRows,
	DIGIT_ROWS,
	type GrowCell,
	GrowKeypad,
	type GrowKeypadHandle,
} from '../grow-keypad';
import { useOverlayPresentation } from '../lib/overlay';
import { cn } from '../lib/utils';
import { Text } from '../text';
import {
	COUNT_DIGITS,
	EMPTY_ENTRY,
	QUANTITY_PLACES,
	quantityEntryReducer,
	typedQuantity,
} from './reducer';

/** Material's minimum touch target (decision 36): the anchored panel is a grid of them. */
const CELL = 48;
// A step lands on the quantity's own places: 1.015 + 1 is 2.015, never 2.0149999999999997.
const GRID = 10 ** QUANTITY_PLACES;
const onGrid = (quantity: number) => Math.round(quantity * GRID) / GRID;
const ARROW_KEYS = { ArrowUp: 'increase', ArrowDown: 'decrease' };
const ANIMATION = { down: 'web:animate-quantity-grow', up: 'web:animate-quantity-grow-up' };

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
	 * A committed quantity, above 0 to six places. Resolving `false`
	 * says the store refused it (the stock guard), and a − or + step is taken back.
	 */
	onChange: (quantity: number) => void | boolean | Promise<void | boolean>;
	/**
	 * − pressed at 1 (the trash). Without it the keypad edits a count (a product's stock): −
	 * stops at 0, a typed 0 commits, and six whole digits fit.
	 */
	onRemove?: () => void;
	/** The places a quantity may carry (six, a line's); with none there is no decimal key. */
	decimals?: number;
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
	decimals = QUANTITY_PLACES,
	disabled = false,
	decimalSeparator = '.',
	labels,
	testID,
	className,
	textClassName,
	onOpenChange,
	ref,
}: QuantityKeypadProps) {
	const shell = React.useRef<GrowKeypadHandle>(null);
	const [entry, dispatch] = React.useReducer(quantityEntryReducer, EMPTY_ENTRY);
	React.useImperativeHandle(ref, () => ({
		focus: () => shell.current?.open(),
		dismiss: () => shell.current?.dismiss(),
	}));

	const count = onRemove === undefined;
	const base = typedQuantity(entry.buffer, count) ?? entry.stepped ?? value;
	const trash = !count && base <= 1;
	const step = (quantity: number) => {
		dispatch({ type: 'step', quantity });
		const unstep = () => dispatch({ type: 'unstep', quantity });
		void Promise.resolve(onChange(quantity)).then((ok) => ok === false && unstep(), unstep);
	};

	const onClose = (discarded: boolean) => {
		const typed = typedQuantity(entry.buffer, count);
		const shown = entry.stepped ?? value;
		// The write presents its own failure (a toast) and the keypad is already closed.
		if (!discarded && typed !== undefined && typed !== shown)
			void Promise.resolve(onChange(typed)).catch(() => undefined);
		dispatch({ type: 'reset' });
	};

	const press = (name: string, fromKeyboard: boolean) => {
		if (name === 'decrease' && trash) {
			// A held ArrowDown stops at 1; only a press on the trash removes the line, and
			// nothing typed is committed on the way out.
			if (fromKeyboard) return;
			shell.current?.dismiss();
			return onRemove?.();
		}
		// A count stops at 0; a negative stock (oversold) still steps up from where it is.
		if (name === 'decrease' && count && base <= 0) return;
		if (name === 'backspace') dispatch({ type: 'backspace' });
		else if (name === 'increase') step(onGrid(base + 1));
		else if (name === 'decrease') step(onGrid(base - 1));
		else if (name !== 'decimal')
			dispatch({
				type: 'digit',
				digit: name,
				places: decimals,
				whole: count ? COUNT_DIGITS : undefined,
			});
		// A whole-number quantity has no fraction to type.
		else if (decimals > 0) dispatch({ type: 'decimal' });
	};

	const display = entry.buffer
		? entry.buffer.replace('.', decimalSeparator)
		: format(entry.stepped ?? value);
	const stepper: GrowCell[] = [
		trash
			? { name: 'decrease', label: labels.remove, icon: 'delete', variant: 'destructive' }
			: { name: 'decrease', label: labels.decrease, icon: 'minus' },
		{ display: <Value display={display} fit={count} textClassName={textClassName} /> },
		{ name: 'increase', label: labels.increase, icon: 'plus' },
	];
	return (
		<GrowKeypad
			ref={shell}
			rows={[
				stepper,
				...DIGIT_ROWS,
				...closingRows(decimals > 0 ? decimalSeparator : undefined, labels),
			]}
			ruled={1}
			cell={CELL}
			align="center"
			animation={ANIMATION}
			disabled={disabled}
			decimalSeparator={decimalSeparator}
			keyNames={ARROW_KEYS}
			onPress={press}
			onOpen={() => dispatch({ type: 'reset' })}
			onClose={onClose}
			onOpenChange={onOpenChange}
		>
			<Button
				testID={testID}
				variant="outline"
				disabled={disabled}
				className={cn('min-w-10 items-start', className)}
			>
				<ButtonText className={textClassName}>{format(value)}</ButtonText>
			</Button>
		</GrowKeypad>
	);
}

/**
 * The number, centred in the stepper row's middle cell. A count (`fit`) reaches `999,999`,
 * which the 48 px cell holds only smaller: past five characters it shrinks, never the panel.
 */
function Value({
	display,
	fit,
	textClassName,
}: {
	display: string;
	fit: boolean;
	textClassName?: string;
}) {
	const sheet = useOverlayPresentation() === 'bottom';
	const size = sheet
		? 'text-xl'
		: !fit || display.length <= 5
			? 'text-base'
			: display.length <= 6
				? 'text-sm'
				: 'text-xs';
	return (
		<Text
			testID="quantity-keypad-value"
			className={cn('text-center font-semibold tabular-nums', size, textClassName)}
		>
			{display}
		</Text>
	);
}
