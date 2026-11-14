import * as React from 'react';
import { type TextInputInstance } from 'react-native';

import { amountFigure } from '@wcpos/components/amount-figure';
import { Input } from '@wcpos/components/input';
import { cn } from '@wcpos/components/lib/utils';
import { PressableSurface } from '@wcpos/components/pressable-surface';
import { Text } from '@wcpos/components/text';
import { useMergedRef } from '@wcpos/hooks/use-merged-ref';

import { type CurrencyFormatOptions, useCurrencyFormat } from '../../hooks/use-currency-format';

/** The figure typed in place: the amount figure's hero step on the input itself. */
const HERO = amountFigure({ size: 'hero' });
const SYMBOL = 'text-2xl text-muted-foreground tabular-nums';

/** One framed figure for every editable register amount. */
export function RegisterAmount({
	currencyOptions,
	ref,
	...props
}: {
	currencyOptions?: CurrencyFormatOptions;
	value: string;
	onChangeText: (v: string) => void;
	testID: string;
	ref?: React.Ref<TextInputInstance>;
} & Pick<
	React.ComponentProps<typeof Input.InputField> & React.AriaAttributes,
	'onBlur' | 'onFocus' | 'onPressIn' | 'editable' | 'aria-invalid' | 'aria-describedby'
>) {
	const { prefix, suffix, format } = useCurrencyFormat(currencyOptions);
	// The locale's own zero, without the symbol that already sits beside it.
	const zero = format(0).replace(prefix, '').replace(suffix, '').trim();
	const inputRef = React.useRef<TextInputInstance>(null);
	const mergedRef = useMergedRef(ref ?? null, inputRef);
	// The symbol sits inside the field's border, so a tap on it is a tap on the field (as the
	// Input's own leading glyph): it focuses the numerals rather than being a dead strip.
	const symbol = (text: string) => (
		<PressableSurface
			wash="none"
			accessible={false}
			tabIndex={-1}
			testID={`${props.testID}-symbol`}
			onPress={() => inputRef.current?.focus()}
		>
			<Text className={SYMBOL}>{text}</Text>
		</PressableSurface>
	);
	return (
		<Input.Root figure>
			{!!prefix && <Input.Left>{symbol(prefix)}</Input.Left>}
			<Input.InputField
				{...props}
				ref={mergedRef}
				type="decimal"
				placeholder={zero}
				className={cn(HERO, 'placeholder:font-normal', !!prefix && 'pl-1.5', !!suffix && 'pr-1.5')}
			/>
			{!!suffix && <Input.Right className="pr-3">{symbol(suffix)}</Input.Right>}
		</Input.Root>
	);
}
