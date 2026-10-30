import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '../button';
import { fieldBox } from '../field-box';
import { closingRows, type GrowCell, GrowKeypad, type GrowKeypadHandle } from '../grow-keypad';
import { DIGIT_ROWS, Key } from '../keypad';
import { useOverlayPresentation } from '../lib/overlay';
import { cn } from '../lib/utils';
import { PressableSurface } from '../pressable-surface';
import { Text } from '../text';
import { draftPrice, EMPTY_PRICE, priceEntryReducer } from './reducer';

/** 3 × 64: the display fits `£1,234.50`; the rows stay Material's 48 tall. */
const CELL = 64;
/**
 * Three quick keys is enough (Paul 2026-10-24): one row of the panel's three cells, the one
 * place the cap lives. Fewer stretch to fill the row, as ✓ fills its own.
 */
export const QUICK_KEYS = 3;
const ANIMATION = { down: 'web:animate-price-grow', up: 'web:animate-price-grow-up' };

export type PriceKeypadLabels = {
	backspace: string;
	done: string;
	/** A quick key's accessible name, e.g. "Discount (12,5%)". */
	discount: (percent: number) => string;
	/** A quick key's text, e.g. "−12,5%". */
	discountKey: (percent: number) => string;
};

export type PriceKeypadProps = {
	/**
	 * The price as stored; `undefined` is a blank one (a product not on sale), which rests as
	 * WooCommerce's own `–` and writes only what is typed.
	 */
	value?: number;
	/** The order's currency format, for the trigger and the display. */
	format: (value: number) => string;
	/** A changed price, 0 included (a free line); a refusal is the write's own toast. */
	onChange: (price: number) => void | boolean | Promise<void | boolean>;
	/** Quick discounts in percent; the first three become keys, filling their row. */
	discounts?: number[];
	/**
	 * The currency's decimal places: typing stops there and a discount rounds to them; with
	 * none, there is no decimal key and the physical separator is ignored.
	 */
	decimals?: number;
	/** The store's decimal separator: the decimal key's label and its physical key. */
	decimalSeparator?: string;
	labels: PriceKeypadLabels;
	disabled?: boolean;
	/** On the trigger; a quick key is `${testID}-discount-${percent}`. */
	testID?: string;
	/** The trigger's text classes at rest. */
	textClassName?: string;
	/**
	 * At rest: `text`, bare text (a grid's price); `field`, the field box (a form's amount);
	 * `key`, a quick key's own cell, filling it and lit while open (the Quick Discounts setting).
	 */
	rest?: 'text' | 'field' | 'key';
	/** A blank field's rest text (a form's "No minimum"); `–` without one. */
	placeholder?: string;
	/** A form label's id: the trigger is named by the label, then its own number. */
	labelledBy?: string;
	/** A form's description and validation message ids, and whether the field is invalid. */
	describedBy?: string;
	invalid?: boolean;
	/** Told when the keypad opens and closes. */
	onOpenChange?: (open: boolean) => void;
	ref?: React.Ref<PriceKeypadHandle>;
};

export type PriceKeypadHandle = {
	/** Opens the keypad, as a press does. */
	focus: () => void;
	/** Closes it keeping the stored price, as Escape does. */
	dismiss: () => void;
};

/**
 * The cart price that grows into its keypad as the quantity does (Paul 2026-10-24, variant 1):
 * the number stays over the trigger in the display row, the quick keys under it, then the
 * digits. A quick key shows the discounted price with its derivation; ✓ or Enter writes it.
 */
export function PriceKeypad({
	value,
	format,
	onChange,
	discounts = [],
	decimals = 2,
	decimalSeparator = '.',
	labels,
	disabled = false,
	testID,
	textClassName,
	rest = 'text',
	placeholder,
	labelledBy,
	describedBy,
	invalid,
	onOpenChange,
	ref,
}: PriceKeypadProps) {
	const shell = React.useRef<GrowKeypadHandle>(null);
	const ownID = React.useId();
	const [entry, dispatch] = React.useReducer(priceEntryReducer, EMPTY_PRICE);
	const [open, setOpen] = React.useState(false);
	React.useImperativeHandle(ref, () => ({
		focus: () => shell.current?.open(),
		dismiss: () => shell.current?.dismiss(),
	}));

	const stored = value ?? 0;
	const draft = draftPrice(entry, stored, decimals);
	const onClose = (discarded: boolean) => {
		// The write presents its own failure (a toast) and the keypad is already closed.
		if (!discarded && draft !== undefined && draft !== value)
			void Promise.resolve(onChange(draft)).catch(() => undefined);
		dispatch({ type: 'reset' });
	};

	const press = (name: string) => {
		const percent = name.startsWith('discount-') ? Number(name.slice(9)) : undefined;
		if (percent !== undefined) dispatch({ type: 'discount', percent });
		else dispatch({ type: 'key', key: name, places: decimals });
	};

	const percents = discounts.slice(0, QUICK_KEYS);
	const quick: GrowCell[] = percents.map((percent) => ({
		name: `discount-${percent}`,
		span: QUICK_KEYS / percents.length,
		label: labels.discount(percent),
		text: labels.discountKey(percent),
		on: entry.discount === percent,
		testID: testID && `${testID}-discount-${percent}`,
	}));
	const shown = entry.buffer
		? entry.buffer.replace('.', decimalSeparator)
		: format(draft ?? stored);
	const derivation =
		entry.discount === undefined ? undefined : `${format(stored)} −${entry.discount} %`;
	const display: GrowCell[] = [
		{ display: <Display shown={shown} derivation={derivation} inset={rest !== 'text'} />, span: 3 },
	];

	const trigger = {
		testID,
		disabled,
		nativeID: labelledBy && ownID,
		'aria-labelledby': labelledBy && `${labelledBy} ${ownID}`,
		'aria-describedby': describedBy,
		'aria-invalid': invalid || undefined,
	};
	const tone = cn('tabular-nums', textClassName, value === undefined && 'text-muted-foreground');
	const text = value === undefined ? (placeholder ?? '–') : format(value);
	return (
		<GrowKeypad
			ref={shell}
			// A key fills its cell: the popover root must fill it first (see `GrowKeypad`).
			className={rest === 'key' ? 'flex-1' : undefined}
			rows={[
				display,
				...(quick.length ? [quick] : []),
				...DIGIT_ROWS,
				...closingRows(decimals > 0 ? decimalSeparator : undefined, labels),
			]}
			ruled={quick.length ? 2 : 1}
			cell={CELL}
			align="end"
			animation={ANIMATION}
			disabled={disabled}
			decimalSeparator={decimalSeparator}
			onPress={press}
			onOpen={() => dispatch({ type: 'reset' })}
			onClose={onClose}
			onOpenChange={(next) => {
				setOpen(next);
				onOpenChange?.(next);
			}}
		>
			{rest === 'key' ? (
				// The Quick Discounts setting: the key as the cashier sees it, primary ink at rest.
				<Key
					{...trigger}
					face="cell"
					name="discount"
					label={value === undefined ? text : labels.discount(value)}
					text={value === undefined ? text : labels.discountKey(value)}
					on={open || (value === undefined ? undefined : false)}
					// A blank slot's `–` is muted, at the keys' size.
					textClassName={value === undefined && !open ? 'text-muted-foreground text-sm' : undefined}
					// Fills the popover root, which fills the cell (`GrowKeypad`'s `className`).
					className="w-full flex-1"
				/>
			) : rest === 'field' ? (
				// A form's price rests as the field box, as an Input does.
				<PressableSurface
					{...trigger}
					role="button"
					wash="none"
					className={cn(
						fieldBox({ state: disabled ? 'disabled' : invalid ? 'invalid' : 'rest' }),
						// The outline Button's pressed wash, written as Button writes its own (`wash="none"`).
						'active:bg-muted w-full items-end justify-center px-3'
					)}
				>
					<Text className={tone}>{text}</Text>
				</PressableSurface>
			) : (
				<Button
					variant="ghost"
					{...trigger}
					// The default size is the row's height. The tint reaches past the text (`-mx-1 px-1`),
					// which `max-w-full` would cap, truncating `55,00 $` in the 56-wide price column
					// (dev-next, 2026-10-24).
					className="-mx-1 max-w-none items-end self-stretch px-1"
				>
					<ButtonText className={tone}>{text}</ButtonText>
				</Button>
			)}
		</GrowKeypad>
	);
}

/**
 * Right-aligned over the trigger's text; a quick key adds its derivation above the result.
 * A field's or key's text sits inside its padding, so the number does not jump as it opens.
 */
function Display({
	shown,
	derivation,
	inset,
}: {
	shown: string;
	derivation?: string;
	inset: boolean;
}) {
	const sheet = useOverlayPresentation() === 'bottom';
	return (
		<View className={cn('items-end', sheet || inset ? 'px-3' : 'px-1')}>
			{derivation !== undefined && (
				<Text variant="help" tabular>
					{derivation}
				</Text>
			)}
			<Text
				testID="price-keypad-value"
				className={cn('font-semibold tabular-nums', sheet ? 'text-xl' : 'text-base')}
			>
				{shown}
			</Text>
		</View>
	);
}
