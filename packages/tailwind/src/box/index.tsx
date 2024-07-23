import * as React from 'react';
import { View } from 'react-native';

import { ViewRef } from '@rn-primitives/types';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

const boxVariants = cva('flex-row bg-transparent', {
	variants: {
		padding: {
			none: 'p-0',
			xs: 'p-1',
			sm: 'p-2',
			md: 'p-3',
			lg: 'p-4',
			xl: 'p-5',
			'2xl': 'p-6',
			'3xl': 'p-7',
			'4xl': 'p-8',
		},
	},
	defaultVariants: {
		padding: 'sm',
	},
});

type BoxProps = React.ComponentPropsWithoutRef<typeof View> & VariantProps<typeof boxVariants>;

const Box = React.forwardRef<ViewRef, BoxProps>(({ className, padding, ...props }, ref) => (
	<View ref={ref} className={cn(boxVariants({ padding, className }))} {...props} />
));
Box.displayName = 'Box';

export { Box };
