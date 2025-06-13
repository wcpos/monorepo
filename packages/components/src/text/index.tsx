import * as React from 'react';
import { Text as RNText } from 'react-native';

import * as Slot from '@rn-primitives/slot';
import { SlottableTextProps } from '@rn-primitives/types';
import { cva, type VariantProps } from 'class-variance-authority';
import { decode } from 'html-entities';

import { cn } from '../lib/utils';

const TextClassContext = React.createContext<string | undefined>(undefined);

const textVariants = cva('text-foreground web:select-text text-base', {
	variants: {
		variant: {
			default: '',
			link: 'web:hover:underline web:focus:underline web:hover:cursor-pointer group-active:underline',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

export type TextProps = SlottableTextProps &
	VariantProps<typeof textVariants> & { decodeHtml?: boolean };

function Text({ className, variant, asChild = false, children, decodeHtml, ...props }: TextProps) {
	const textClass = React.useContext(TextClassContext);
	const Component = asChild ? Slot.Text : RNText;

	const processedChildren =
		decodeHtml && typeof children === 'string' ? decode(children) : children;

	return (
		<Component className={cn(textVariants({ variant }), textClass, className)} {...props}>
			{processedChildren}
		</Component>
	);
}

export { Text, TextClassContext };
