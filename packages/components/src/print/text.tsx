import * as React from 'react';
import { Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

type TextUnderline = '1dot-thick' | '2dot-thick' | 'none';

const textVariants = cva('web:select-text text-card-foreground font-mono', {
	variants: {
		size: {
			sm: 'text-xs',
			md: 'text-base leading-5',
			lg: 'text-lg',
		},
		align: {
			left: 'text-left',
			center: 'text-center',
			right: 'text-right',
		},
		bold: {
			true: 'font-bold',
		},
		uppercase: {
			true: 'uppercase',
		},
		underline: {
			'1pt': 'border-b border-black',
			'2pt': 'border-b-2 border-black',
			none: '',
		},
	},
	defaultVariants: {
		size: 'md',
		align: 'left',
		bold: false,
		uppercase: false,
		underline: 'none',
	},
});

type TextProps = RNTextProps & VariantProps<typeof textVariants>;

/**
 *
 */
export const Text = ({
	children,
	size,
	align,
	bold,
	underline,
	uppercase,
	className,
}: TextProps) => {
	return (
		<RNText className={cn(textVariants({ size, align, bold, underline, uppercase }), className)}>
			{children}
		</RNText>
	);
};
