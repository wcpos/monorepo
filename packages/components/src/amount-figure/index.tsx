import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

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
		tone: { default: 'text-foreground', destructive: 'text-destructive', success: 'text-success' },
	},
	defaultVariants: { size: 'hero', tone: 'default' },
});

type AmountFigureProps = Omit<TextProps, 'variant' | 'tabular'> &
	VariantProps<typeof amountFigure> & {
		/** The caption above the figure: "Remaining", "On the terminal". */
		eyebrow?: string;
	};

function AmountFigure({ size, tone, eyebrow, className, ...props }: AmountFigureProps) {
	const figure = <Text className={cn(amountFigure({ size, tone }), className)} {...props} />;
	if (eyebrow === undefined) return figure;
	return (
		<View className="gap-1">
			<Text variant="caption">{eyebrow}</Text>
			{figure}
		</View>
	);
}

export { AmountFigure, amountFigure };
