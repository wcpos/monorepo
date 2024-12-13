import * as React from 'react';
import { Text as RNText } from 'react-native';

import * as Slot from '@rn-primitives/slot';
import { SlottableTextProps, TextRef } from '@rn-primitives/types';
import { cva, type VariantProps } from 'class-variance-authority';
import { decode } from 'html-entities';

import { cn } from '../lib/utils';

const TextClassContext = React.createContext<string | undefined>(undefined);

const textVariants = cva('text-base text-foreground web:select-text', {
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

type TextProps = SlottableTextProps & VariantProps<typeof textVariants> & { decodeHtml?: boolean };

const Text = React.forwardRef<TextRef, TextProps>(
	({ className, variant, asChild = false, children, decodeHtml, ...props }, ref) => {
		const textClass = React.useContext(TextClassContext);
		const Component = asChild ? Slot.Text : RNText;

		const processedChildren =
			decodeHtml && typeof children === 'string' ? decode(children) : children;

		return (
			<Component
				className={cn(textVariants({ variant }), textClass, className)}
				ref={ref}
				{...props}
			>
				{processedChildren}
			</Component>
		);
	}
);
Text.displayName = 'Text';

export { Text, TextClassContext };
