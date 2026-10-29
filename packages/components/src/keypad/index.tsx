import type * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cva } from 'class-variance-authority';

import { HStack } from '../hstack';
import { Icon, type IconName } from '../icon';
import { cn } from '../lib/utils';
import { PressableSurface } from '../pressable-surface';
import { Text } from '../text';
import { TextClassContext } from '../text/context';

export type KeypadKey = {
	/** What a press reports: a digit, `decimal`, `backspace`, or the caller's own key. */
	name: string;
	/** The accessible name: the digit, or the caller's translated one. */
	label: string;
	/** The key's text when it is not its name (`−10%`, named "Discount (10%)"). */
	text?: string;
	icon?: IconName;
	variant?: 'bad' | 'primary';
	span?: number;
	/** A quick key: lit (`true`) while its value is the draft. */
	on?: boolean;
	disabled?: boolean;
	testID?: string;
};

export const DIGIT_ROWS: KeypadKey[][] = ['123', '456', '789'].map((row) =>
	[...row].map((digit) => ({ name: digit, label: digit }))
);

/** The store's separator, 0, ⌫; with no separator (a currency without places) 0 spans its cell. */
export function decimalRow(separator: string | undefined, backspace: string): KeypadKey[] {
	return [
		...(separator ? [{ name: 'decimal', label: separator }] : []),
		{ name: '0', label: '0', span: separator ? 1 : 2 },
		{ name: 'backspace', label: backspace, icon: 'backspace' },
	];
}

/** THE key face (ledger line 7): the price keypad's phone key; `cell` sits under one panel's border. */
const keyFace = cva('items-center justify-center', {
	variants: {
		face: {
			key: 'bg-muted min-h-ctl rounded-lg active:opacity-70',
			cell: 'web:hover:bg-muted active:bg-muted',
		},
		quick: { none: '', off: '', lit: 'bg-primary' },
	},
	compoundVariants: [{ face: 'key', quick: 'off', class: 'border-border border bg-transparent' }],
});
const keyText = cva('font-semibold', {
	variants: {
		face: { key: 'text-xl', cell: 'text-lg' },
		quick: { none: '', off: 'text-sm', lit: 'text-sm' },
	},
});

type KeyProps = KeypadKey & {
	face?: 'key' | 'cell';
	/** Optional only for a popover trigger, whose press its `asChild` slot supplies. */
	onPress?: () => void;
	textClassName?: string;
} & ViewProps;

/** One key: role, name, `keypad-key-<name>` unless the caller names it, the face. */
export function Key({
	face = 'key',
	name,
	label,
	text,
	icon,
	variant,
	on,
	textClassName,
	...props
}: KeyProps) {
	const quick = on === undefined ? 'none' : on ? 'lit' : 'off';
	const ink =
		quick === 'lit'
			? 'text-primary-foreground'
			: quick === 'off'
				? 'text-primary'
				: variant === 'bad'
					? 'text-bad'
					: variant === 'primary'
						? 'text-primary'
						: undefined;
	return (
		<PressableSurface
			{...props}
			wash="none"
			role="button"
			disabled={!!props.disabled}
			testID={props.testID ?? `keypad-key-${name}`}
			accessibilityLabel={label}
			aria-pressed={on}
			className={cn(keyFace({ face, quick }), props.className)}
		>
			<TextClassContext.Provider value={ink}>
				{icon ? (
					<Icon name={icon} />
				) : (
					<Text className={cn(keyText({ face, quick }), textClassName)}>{text ?? label}</Text>
				)}
			</TextClassContext.Provider>
		</PressableSurface>
	);
}

type KeypadProps = ViewProps & {
	rows: readonly (readonly KeypadKey[])[];
	onPress: (name: string) => void;
	fit?: 'tile' | 'shrink';
};

/** Rows of keys with no display or value; a key is `<testID>-key-<name>`. */
export function Keypad({ rows, onPress, fit = 'tile', testID, className, ...props }: KeypadProps) {
	const shrink = fit === 'shrink';
	return (
		<View {...props} testID={testID} className={cn('gap-2', shrink && 'min-h-0 flex-1', className)}>
			{rows.map((row, index) => (
				<HStack key={index} className={cn('items-stretch gap-2', shrink && 'min-h-ctl flex-1')}>
					{row.map((key) => (
						<Key
							key={key.name}
							{...key}
							testID={key.testID ?? (testID ? `${testID}-key-${key.name}` : undefined)}
							style={{ flex: key.span ?? 1 }}
							className={shrink ? undefined : 'h-tile'}
							onPress={() => onPress(key.name)}
						/>
					))}
				</HStack>
			))}
		</View>
	);
}
