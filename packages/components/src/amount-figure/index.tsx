import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { TONE } from '../lib/tone';
import { fontFamilyStyle } from '../lib/fonts';
import { useThemeTraits } from '../lib/theme-traits';
import { cn } from '../lib/utils';
import { Text, type TextProps } from '../text';

/**
 * The figure a screen leads with (CODING_STANDARDS § Design 1: one number, one action), in three
 * steps: `hero` the amount the screen is about (`text-amt`), `headline` that figure in a compact
 * pane, `tile` one figure among equals. Bold and tabular; a tone only when it means something.
 * A TextInput cannot be wrapped, so the class string is the interface for a figure typed in place.
 */
const amountFigure = cva('font-bold tabular-nums', {
	variants: {
		size: { hero: 'text-amt', headline: 'text-2xl', tile: 'text-xl' },
		tone: { default: 'text-foreground', bad: TONE.bad.text, ok: TONE.ok.text },
	},
	defaultVariants: { size: 'hero', tone: 'default' },
});

type AmountFigureProps = Omit<TextProps, 'variant' | 'tabular'> &
	VariantProps<typeof amountFigure> & {
		/** The caption above the figure: "Remaining", "On the terminal". */
		eyebrow?: string;
		/** On a centred stage (the terminal, the paid moment): the figure and its eyebrow alike. */
		center?: boolean;
	};

function AmountFigure({ size, tone, eyebrow, center, className, ...props }: AmountFigureProps) {
	const { type } = useThemeTraits();
	const figure = (
		<Text
			className={cn(
				amountFigure({ size, tone }),
				type.displayItalic && 'italic',
				center && 'text-center',
				className
			)}
			{...props}
			style={type.display ? [fontFamilyStyle(type.display), props.style] : props.style}
		/>
	);
	if (eyebrow === undefined) return figure;
	return (
		<View className={cn('gap-1', center && 'items-center')}>
			<Text variant="caption">{eyebrow}</Text>
			{figure}
		</View>
	);
}

export { AmountFigure, amountFigure };
