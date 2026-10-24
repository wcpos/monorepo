import * as React from 'react';
import { View } from 'react-native';

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

	const finish = (next?: number) => {
		settled.current = true;
		setEditing(false);
		if (next !== undefined) onChangeText(next);
	};

	if (!editing) {
		return (
			<Button
				variant="ghost"
				testID={testID}
				disabled={disabled}
				// The default size is the row's height, so the field that replaces it keeps the row.
				// The tint reaches past the text (`-mx-1 px-1`), which `max-w-full` would cap,
				// truncating `55,00 $` in the 56-wide price column (dev-next, 2026-10-24).
				className="-mx-1 max-w-none items-end self-stretch px-1"
				onPress={() => {
					settled.current = false;
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
		<VStack space="xs" className="items-end self-stretch">
			<NumberInput
				testID={testID && `${testID}-field`}
				autoFocus
				selectTextOnFocus
				value={value}
				formatOptions={formatOptions}
				inputClassName="px-1 text-right tabular-nums"
				onChangeText={(next) => !settled.current && finish(next)}
				onKeyPress={(event) => event.nativeEvent.key === 'Escape' && finish()}
			/>
			{!!discounts?.length && (
				// Web: a press on a chip must not blur the field first (the blur would commit and
				// unmount the chips before the click lands).
				<View
					// One line, wider than the price column, reaching left over the row: wrapping
					// in the column stacked the chips four deep (dev-next, 2026-10-24).
					className="flex-row justify-end gap-1"
					{...{ onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault() }}
				>
					{discounts.map((discount) => (
						<Chip
							key={discount}
							size="sm"
							label={`−${discount}%`}
							testID={testID && `${testID}-discount-${discount}`}
							// Rounded to the store's price places (2, WooCommerce's default, before the store loads).
							onPress={() =>
								finish(round(toNumber(value) * (1 - discount / 100), toNumber(decimals ?? 2)))
							}
						/>
					))}
				</View>
			)}
		</VStack>
	);
}
