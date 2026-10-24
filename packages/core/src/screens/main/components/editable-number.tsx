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
import { NumberInput } from './number-input';

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
	const [editing, setEditing] = React.useState(false);
	// Escape and a chip leave without the field's own value: the blur that follows must not commit.
	const settled = React.useRef(false);
	const box = React.useRef<{ contains?: (node: unknown) => boolean }>(null);
	/**
	 * The editor owns what was typed for the whole session: a number, '' for a cleared field, or
	 * undefined while untouched. It is fed back as the field's value, so leaving to a chip and
	 * coming back (Shift+Tab) shows it again, and it is committed when the session ends. State
	 * for the field, a ref for the handlers that read it in the same event.
	 */
	const [draft, setDraftState] = React.useState<number | '' | undefined>(undefined);
	const draftRef = React.useRef<number | '' | undefined>(undefined);
	const setDraft = (next: number | '' | undefined) => {
		draftRef.current = next;
		setDraftState(next);
	};
	// Enter, Escape and a chip hand focus back to the price, so Tab carries on from it; a click
	// elsewhere keeps its own focus.
	const refocus = React.useRef(false);
	const input = React.useRef<TextInputInstance>(null);
	const rest = React.useRef<{ focus?: () => void }>(null);

	React.useEffect(() => {
		if (!editing && refocus.current) {
			refocus.current = false;
			rest.current?.focus?.();
		}
	}, [editing]);

	/** End the session: the draft goes with it. */
	const end = () => {
		settled.current = true;
		setDraft(undefined);
		setEditing(false);
	};

	/** Leave without the draft (Escape, or a chip's own number): the field's blur then commits nothing. */
	const leave = (next?: number) => {
		settled.current = true;
		refocus.current = true;
		if (next !== undefined) onChangeText(next);
		input.current?.blur();
		end();
	};

	/**
	 * A blur in the editor. Web: focus moving to a chip (Tab) keeps it open, or the chip taking
	 * focus would unmount. Focus leaving it commits the draft once, unless settled, and only when
	 * it changes the record: untouched, or typed back to the stored number, writes nothing; a 0
	 * over a blank writes 0; a cleared field writes 0 over a number and nothing over a blank.
	 */
	const close = (blur?: unknown) => {
		// Web's FocusEvent; native's blur event carries no target, so native always closes.
		const event = blur as { relatedTarget?: unknown; nativeEvent?: { relatedTarget?: unknown } };
		const next = event?.nativeEvent?.relatedTarget ?? event?.relatedTarget;
		if (next && box.current?.contains?.(next)) return;
		const typed = draftRef.current;
		const blank = value == null || value === '';
		if (!settled.current && typed !== undefined && !(typed === '' && blank)) {
			const number = typed === '' ? 0 : typed;
			if (blank || number !== toNumber(value)) onChangeText(number);
		}
		end();
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
		<VStack {...{ ref: box }} space="xs" className="items-end self-stretch">
			<NumberInput
				ref={input}
				testID={testID && `${testID}-field`}
				autoFocus
				selectTextOnFocus
				value={draft ?? value}
				formatOptions={formatOptions}
				inputClassName="px-1 text-right tabular-nums"
				onBlur={close}
				onDraftChange={setDraft}
				onSubmitEditing={() => (refocus.current = true)}
				onKeyPress={(event) => event.nativeEvent.key === 'Escape' && leave()}
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
							// The number in the field (the stored one while untouched), rounded to the
							// store's price places (2, WooCommerce's default, before the store loads).
							onPress={() => {
								const base = typeof draftRef.current === 'number' ? draftRef.current : value;
								leave(round((toNumber(base) || 0) * (1 - discount / 100), toNumber(decimals ?? 2)));
							}}
						/>
					))}
				</View>
			)}
		</VStack>
	);
}
