import * as React from 'react';
import { View } from 'react-native';

import { ViewRef } from '@rn-primitives/types';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

const vstackVariants = cva('flex-col w-full', {
	variants: {
		space: {
			xs: 'gap-1',
			sm: 'gap-2',
			md: 'gap-3',
			lg: 'gap-4',
			xl: 'gap-5',
			'2xl': 'gap-6',
			'3xl': 'gap-7',
			'4xl': 'gap-8',
		},
		reversed: {
			true: 'flex-col-reverse',
		},
	},
	defaultVariants: {
		space: 'sm',
		reversed: false,
	},
});

type VStackProps = React.ComponentPropsWithoutRef<typeof View> &
	VariantProps<typeof vstackVariants>;

const VStack = React.forwardRef<ViewRef, VStackProps>(
	({ className, space, reversed, ...props }, ref) => (
		<View ref={ref} className={cn(vstackVariants({ space, reversed, className }))} {...props} />
	)
);
VStack.displayName = 'VStack';

export { VStack };
