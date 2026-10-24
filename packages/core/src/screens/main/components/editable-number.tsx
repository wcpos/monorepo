import * as React from 'react';
import { type TextInputInstance, View } from 'react-native';

import round from 'lodash/round';
import toNumber from 'lodash/toNumber';

import { Button, ButtonText } from '@wcpos/components/button';
import { Chip } from '@wcpos/components/chip';
import { cn } from '@wcpos/components/lib/utils';
import { VStack } from '@wcpos/components/vstack';
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
	/** Quick discounts (percent) offered under the field while editing. */
	discounts?: number[];
	disabled?: boolean;
	/** Rest-state text classes. */
	textClassName?: string;
	testID?: string;
}

/**
 * A number edited in place (decision 16): quiet text with a hover tint at rest, one press turns
 * it into a field in the same row. Enter and blur commit, Escape cancels. Mirrors `EditableField`.
 */
export function EditableNumber({
	value,
	display,
	onChangeText,
	formatOptions,
	discounts,
	disabled,
	textClassName,
	testID,
}: EditableNumberProps) {
	const { store } = useAppState();
	const decimals = useDocField(store, (state) => state.price_num_decimals);
	const decimalSep = useDocField(store, (state) => state.price_decimal_sep) || '.';
	const thousandSep = useDocField(store, (state) => state.price_thousand_sep) || '';
	const [editing, setEditing] = React.useState(false);
	/**
	 * While open, the draft IS the field's raw text (undefined: never typed). It is fed back to
	 * the field, so leaving to a chip and coming back shows it, and every exit reads it. State
	 * for the field, a ref for the handlers that read it in the same event.
	 */
	const [draft, setDraftState] = React.useState<string | undefined>(undefined);
	const draftRef = React.useRef<string | undefined>(undefined);
	const setDraft = (text: string | undefined) => {
		draftRef.current = text;
		setDraftState(text);
	};
	// The session has ended: a blur that follows (the field's, after a chip or Escape) writes nothing.
	const settled = React.useRef(false);
	// Enter, Escape and a chip hand focus back to the price, so Tab carries on from it; a click
	// elsewhere keeps its own focus.
	const refocus = React.useRef(false);
	const box = React.useRef<{ contains?: (node: unknown) => boolean }>(null);
	const input = React.useRef<TextInputInstance>(null);
	const rest = React.useRef<{ focus?: () => void }>(null);

	React.useEffect(() => {
		if (!editing && refocus.current) {
			refocus.current = false;
			rest.current?.focus?.();
		}
	}, [editing]);

	const stored = value == null || value === '' ? undefined : toNumber(value);
	/** The draft as a number: the stored one while untouched; '' is 0 (nothing over a blank); NaN unreadable. */
	const draftNumber = () => {
		const text = draftRef.current;
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
		setDraft(undefined);
		setEditing(false);
	};

	/** A chip's number, or Escape (nothing): focus goes back to the price. */
	const leave = (next: number | undefined) => {
		refocus.current = true;
		finish(next);
		input.current?.blur();
	};
	const onEscape = (event: { nativeEvent: { key: string } }) =>
		event.nativeEvent.key === 'Escape' && leave(undefined);

	/** A blur in the editor: focus moving to a chip (Tab) keeps it open; leaving it writes the draft. */
	const close = (blur?: unknown) => {
		// Web's FocusEvent; native's blur event carries no target, so native always closes.
		const event = blur as { relatedTarget?: unknown; nativeEvent?: { relatedTarget?: unknown } };
		const next = event?.nativeEvent?.relatedTarget ?? event?.relatedTarget;
		if (next && box.current?.contains?.(next)) return;
		finish(draftNumber());
	};

	if (!editing) {
		return (
			<Button
				{...{ ref: rest }}
				variant="ghost"
				testID={testID}
				disabled={disabled}
				// The default size is the row's height, so the field that replaces it keeps the row.
				// The tint reaches past the text (`-mx-1 px-1`), which `max-w-full` would cap,
				// truncating `55,00 $` in the 56-wide price column (dev-next, 2026-10-24).
				className="-mx-1 max-w-none items-end self-stretch px-1"
				onPress={() => {
					settled.current = false;
					setDraft(undefined);
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
		// Web: Escape on a chip reaches here; the field stops its own keys, so it has its own.
		<VStack {...{ ref: box, onKeyDown: onEscape }} space="xs" className="items-end self-stretch">
			<NumberInput
				ref={input}
				testID={testID && `${testID}-field`}
				autoFocus
				selectTextOnFocus
				value={value}
				draft={draft}
				formatOptions={formatOptions}
				inputClassName="px-1 text-right tabular-nums"
				onBlur={close}
				onDraftChange={setDraft}
				onSubmitEditing={() => (refocus.current = true)}
				onKeyPress={onEscape}
			/>
			{!!discounts?.length && (
				// Web: a mouse press on a chip keeps focus in the field. Safari does not focus a
				// clicked button, so the blur would carry no chip as its target and close the editor
				// before the click lands. A chip reached by Tab blurs here when focus moves on.
				<View
					// One line, wider than the price column, reaching left over the row: wrapping
					// in the column stacked the chips four deep (dev-next, 2026-10-24).
					className="flex-row justify-end gap-1"
					{...{
						onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
						onBlur: close,
					}}
				>
					{discounts.map((discount) => (
						<Chip
							key={discount}
							size="sm"
							label={`−${discount}%`}
							testID={testID && `${testID}-discount-${discount}`}
							// The draft as a number ('' is 0), rounded to the store's price places
							// (2, WooCommerce's default, before the store loads).
							onPress={() =>
								leave(round((draftNumber() ?? 0) * (1 - discount / 100), toNumber(decimals ?? 2)))
							}
						/>
					))}
				</View>
			)}
		</VStack>
	);
}
