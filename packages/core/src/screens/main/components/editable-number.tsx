import * as React from 'react';
import { type TextInputInstance, View } from 'react-native';

import toNumber from 'lodash/toNumber';

import { Button, type ButtonRef, ButtonText } from '@wcpos/components/button';
import { cn } from '@wcpos/components/lib/utils';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { NumberInput, parseNumber } from './number-input';

import type { NumberFormatOptions } from '../hooks/use-number-format';

interface EditableNumberProps {
	value?: number | string;
	/** The cell's own formatted text for the rest state. */
	display: string;
	onChangeText: (value: number) => void;
	formatOptions?: NumberFormatOptions;
	disabled?: boolean;
	/** Rest-state text classes. */
	textClassName?: string;
	testID?: string;
}

/**
 * A number edited in place (decision 16): quiet text with a hover tint at rest, one press turns
 * it into a field in the same row. Enter and blur commit, Escape cancels. Mirrors `EditableField`.
 * Native only in practice: on web the price cells use `MoneyInput`, which grows into the price
 * keypad (Paul 2026-10-24).
 */
export function EditableNumber({
	value,
	display,
	onChangeText,
	formatOptions,
	disabled,
	textClassName,
	testID,
}: EditableNumberProps) {
	const { store } = useAppState();
	const decimalSep = useDocField(store, (state) => state.price_decimal_sep) || '.';
	const thousandSep = useDocField(store, (state) => state.price_thousand_sep) || '';
	const [editing, setEditing] = React.useState(false);
	// While open, the field's raw text (undefined: never typed), which every exit reads.
	const draft = React.useRef<string | undefined>(undefined);
	// The session has ended: a blur that follows (the field's, after Escape) writes nothing.
	const settled = React.useRef(false);
	// Enter and Escape hand focus back to the price, so Tab carries on from it; a click
	// elsewhere keeps its own focus.
	const refocus = React.useRef(false);
	const input = React.useRef<TextInputInstance>(null);
	const rest = React.useRef<ButtonRef>(null);

	React.useEffect(() => {
		if (!editing && refocus.current) {
			refocus.current = false;
			rest.current?.focus?.();
		}
	}, [editing]);

	const stored = value == null || value === '' ? undefined : toNumber(value);
	/** The draft as a number: the stored one while untouched; '' is 0 (nothing over a blank); NaN unreadable. */
	const draftNumber = () => {
		const text = draft.current;
		if (text === undefined) return stored;
		if (text.trim() === '') return stored === undefined ? undefined : 0;
		return parseNumber(text, decimalSep, thousandSep);
	};

	/** The one exit: writes `next` once when it is a number that changes the record, then closes. */
	const finish = (next: number | undefined) => {
		if (!settled.current && next !== undefined && Number.isFinite(next) && next !== stored) {
			onChangeText(next);
		}
		settled.current = true;
		draft.current = undefined;
		setEditing(false);
	};

	/** Escape writes nothing, and focus goes back to the price. */
	const onEscape = (event: { nativeEvent: { key: string } }) => {
		if (event.nativeEvent.key !== 'Escape') return;
		refocus.current = true;
		finish(undefined);
		input.current?.blur();
	};

	if (!editing) {
		return (
			<Button
				ref={rest}
				variant="ghost"
				testID={testID}
				disabled={disabled}
				// The default size is the row's height, so the field that replaces it keeps the row.
				// The tint reaches past the text (`-mx-1 px-1`), which `max-w-full` would cap,
				// truncating `55,00 $` in the 56-wide price column (dev-next, 2026-10-24).
				className="-mx-1 max-w-none items-end self-stretch px-1"
				onPress={() => {
					settled.current = false;
					draft.current = undefined;
					setEditing(true);
				}}
			>
				<ButtonText className={cn('tabular-nums', textClassName)}>{display}</ButtonText>
			</Button>
		);
	}

	return (
		// Stretched to the cell, so the field is the column's width: an <input> sized by its
		// content is 20 characters wide and spilled over the next column (dev-next, 2026-10-24).
		<View className="items-end self-stretch">
			<NumberInput
				ref={input}
				testID={testID && `${testID}-field`}
				autoFocus
				selectTextOnFocus
				value={value}
				formatOptions={formatOptions}
				inputClassName="px-1 text-right tabular-nums"
				onBlur={() => finish(draftNumber())}
				onDraftChange={(text) => (draft.current = text)}
				onSubmitEditing={() => (refocus.current = true)}
				onKeyPress={onEscape}
			/>
		</View>
	);
}
