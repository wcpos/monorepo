import * as React from 'react';

import { fieldBox } from '../field-box';
import { closingRows, type GrowCell, GrowKeypad, type GrowKeypadHandle } from '../grow-keypad';
import { DIGIT_ROWS } from '../keypad';
import { useOverlayPresentation } from '../lib/overlay';
import { cn } from '../lib/utils';
import { PressableSurface } from '../pressable-surface';
import { Text } from '../text';
import { EMPTY_ENTRY, QUANTITY_PLACES, quantityEntryReducer, typedQuantity } from './reducer';

/** Material's minimum touch target (decision 36): the anchored panel is a grid of them. */
const CELL = 48;
// A step lands on the quantity's own places: 1.015 + 1 is 2.015, never 2.0149999999999997.
const GRID = 10 ** QUANTITY_PLACES;
const onGrid = (quantity: number) => Math.round(quantity * GRID) / GRID;
const ARROW_KEYS = { ArrowUp: 'increase', ArrowDown: 'decrease' };
const ANIMATION = { down: 'web:animate-quantity-grow', up: 'web:animate-quantity-grow-up' };
const sizeFor = (display: string, sheet: boolean) =>
	sheet
		? 'text-xl'
		: display.length <= 5
			? 'text-base'
			: display.length <= 6
				? 'text-sm'
				: 'text-xs';

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
	 * stops at 0, a typed 0 commits.
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
	/** A form label's id: the trigger is named by the label, then its own number. */
	labelledBy?: string;
	/** A form's description and validation message ids, and whether the field is invalid. */
	describedBy?: string;
	invalid?: boolean;
	/** `attention`: the box marks its number (a line over stock). */
	tone?: 'attention';
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
	labelledBy,
	describedBy,
	invalid,
	tone,
	onOpenChange,
	ref,
}: QuantityKeypadProps) {
	const shell = React.useRef<GrowKeypadHandle>(null);
	const ownID = React.useId();
	const [entry, dispatch] = React.useReducer(quantityEntryReducer, EMPTY_ENTRY);
	React.useImperativeHandle(ref, () => ({
		focus: () => shell.current?.open(),
		dismiss: () => shell.current?.dismiss(),
	}));

	const count = onRemove === undefined;
	const base = typedQuantity(entry.buffer, count) ?? entry.stepped ?? value;
	const trash = !count && base <= 1;
	// Step writes not yet settled: a stored change that lands meanwhile is one of them catching
	// up, and must not drop the number a second fast press has already moved on to.
	const pending = React.useRef(0);
	const step = (quantity: number) => {
		dispatch({ type: 'step', quantity });
		pending.current += 1;
		const settled = () => (pending.current -= 1);
		const unstep = () => dispatch({ type: 'unstep', quantity });
		void Promise.resolve(onChange(quantity))
			.then((ok) => ok === false && unstep(), unstep)
			.finally(settled);
	};
	// Once nothing is in flight the stored quantity is the truth: a later revert (the server
	// refusing a stock push) shows, and the next step counts from it.
	React.useEffect(() => {
		if (pending.current === 0) dispatch({ type: 'settle' });
	}, [value]);

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
		if (name === 'increase') step(onGrid(base + 1));
		else if (name === 'decrease') step(onGrid(base - 1));
		else
			dispatch({
				type: 'key',
				key: name,
				places: decimals,
			});
	};

	const display = entry.buffer
		? entry.buffer.replace('.', decimalSeparator)
		: format(entry.stepped ?? value);
	const stepper: GrowCell[] = [
		trash
			? { name: 'decrease', label: labels.remove, icon: 'delete', variant: 'bad' }
			: { name: 'decrease', label: labels.decrease, icon: 'minus' },
		{ display: <Value display={display} textClassName={textClassName} /> },
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
			<PressableSurface
				testID={testID}
				role="button"
				wash="none"
				disabled={disabled}
				nativeID={labelledBy && ownID}
				aria-labelledby={labelledBy && `${labelledBy} ${ownID}`}
				aria-describedby={describedBy}
				aria-invalid={invalid || undefined}
				className={cn(
					fieldBox({ state: disabled ? 'disabled' : invalid ? 'invalid' : (tone ?? 'rest') }),
					// The outline Button's pressed wash, written as Button writes its own (`wash="none"`).
					'active:bg-muted max-w-full min-w-10 items-start justify-center px-3',
					className
				)}
			>
				{/* At rest the box only truncates: a form field or the stock cell has room, the cart's box has not. */}
				<Text numberOfLines={1} className={cn('max-w-full tabular-nums', textClassName)}>
					{format(value)}
				</Text>
			</PressableSurface>
		</GrowKeypad>
	);
}

/**
 * The number, centred in the stepper row's middle cell. Every quantity shrinks past five
 * characters, as a count always did, and truncates past the 48 px cell; it never widens the panel.
 */
function Value({ display, textClassName }: { display: string; textClassName?: string }) {
	const sheet = useOverlayPresentation() === 'bottom';
	return (
		<Text
			testID="quantity-keypad-value"
			numberOfLines={1}
			className={cn(
				'text-center font-semibold tabular-nums',
				sizeFor(display, sheet),
				textClassName
			)}
		>
			{display}
		</Text>
	);
}
