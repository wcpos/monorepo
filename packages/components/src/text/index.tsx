import * as React from 'react';
import { Text as RNText } from 'react-native';

import { Slot } from '@rn-primitives/slot';
import { SlottableTextProps } from '@rn-primitives/types';
import { cva, type VariantProps } from 'class-variance-authority';
import { decode } from 'html-entities';

import { cn } from '../lib/utils';
import { MAX_FONT_SCALE } from '../lib/scale';

const TextClassContext = React.createContext<string | undefined>(undefined);

const textVariants = cva('text-foreground web:select-text text-base', {
	variants: {
		variant: {
			default: '',
			link: 'web:hover:underline web:focus:underline web:hover:cursor-pointer',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

export type TextProps = SlottableTextProps &
	VariantProps<typeof textVariants> & { decodeHtml?: boolean };

function Text({
	className,
	variant,
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
			className={cn(textVariants({ variant }), textClass, className)}
			maxFontSizeMultiplier={maxFontSizeMultiplier}
			{...props}
		>
			{processedChildren}
		</Component>
	);
}

export { Text, TextClassContext };
