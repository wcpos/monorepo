import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { cn } from '@wcpos/components/lib/utils';

import { TypedField } from './typed-field';
import { useAmount } from './use-amount';

import type { AmountFieldProps } from './types';

/**
 * Native: the typed field. `quiet` rests as the cell's text with a hover tint, and one press
 * turns it into the field in the same row (decision 16); a quantity or count is the field.
 */
export function AmountField(props: AmountFieldProps) {
	const amount = useAmount(props);
	const [editing, setEditing] = React.useState(false);
	const { stored } = amount;
	// `field` and `key` (a Quick Discounts slot) are both the typed field here (decision 16).
	if (props.look !== 'quiet' || props.kind === 'quantity' || props.kind === 'count') {
		return <TypedField {...props} amount={amount} />;
	}
	if (editing) {
		// Stretched to the cell, so the field is the column's width (dev-next, 2026-10-24).
		return (
			<View className="items-end self-stretch">
				<TypedField
					{...props}
					amount={amount}
					testID={props.testID && `${props.testID}-field`}
					autoFocus
					textClassName="px-1 text-right"
					onDone={() => setEditing(false)}
				/>
			</View>
		);
	}
	return (
		<Button
			variant="ghost"
			testID={props.testID}
			disabled={props.disabled}
			// The default size is the row's height, so the field that replaces it keeps the row.
			// The tint reaches past the text (`-mx-1 px-1`), which `max-w-full` would cap.
			className="-mx-1 max-w-none items-end self-stretch px-1"
			onPress={() => setEditing(true)}
		>
			{/* A blank price (no sale price) rests as WooCommerce's `–`, muted, never `0.00`. */}
			<ButtonText
				className={cn(
					'tabular-nums',
					props.textClassName,
					stored === undefined && 'text-muted-foreground'
				)}
			>
				{stored === undefined ? (props.placeholder ?? '–') : amount.format(stored)}
			</ButtonText>
		</Button>
	);
}
