import * as React from 'react';
import { Text as RNText } from 'react-native';

import { Slot } from '@rn-primitives/slot';
import { SlottableTextProps } from '@rn-primitives/types';
import { type VariantProps } from 'class-variance-authority';
import { decode } from 'html-entities';

import { cn } from '../lib/utils';
import { MAX_FONT_SCALE } from '../lib/scale';
import { TEXT_VARIANTS, textVariants } from './ladder';

const TextClassContext = React.createContext<string | undefined>(undefined);

export type TextProps = SlottableTextProps &
	VariantProps<typeof textVariants> & { decodeHtml?: boolean };

function Text({
	className,
	variant,
	tabular,
	asChild = false,
	children,
	decodeHtml,
	// The OS text-size multiplier is capped here rather than at every call site:
	// past 1.3x the keypad and the cart break. A caller's prop still wins.
	maxFontSizeMultiplier = MAX_FONT_SCALE,
	...props
}: TextProps) {
	const textClass = React.useContext(TextClassContext);
	const Component = asChild ? Slot : RNText;

	const processedChildren =
		decodeHtml && typeof children === 'string' ? decode(children) : children;

	return (
		<Component
			// An inherited context styles a plain Text; an explicit rank is the caller's word and
			// lands after it (a muted `help` inside an overlay's `text-foreground` stays muted).
			className={cn(
				textVariants({ tabular }),
				textClass,
				variant ? TEXT_VARIANTS[variant] : undefined,
				className
			)}
			maxFontSizeMultiplier={maxFontSizeMultiplier}
			{...props}
		>
			{processedChildren}
		</Component>
	);
}

export { Text, TextClassContext };
