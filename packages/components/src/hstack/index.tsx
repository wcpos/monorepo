import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

const hstackVariants = cva('flex-row items-center', {
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
			true: 'flex-row-reverse',
		},
	},
	defaultVariants: {
		space: 'sm',
		reversed: false,
	},
});

type HStackProps = React.ComponentPropsWithoutRef<typeof View> &
	VariantProps<typeof hstackVariants>;

function HStack({ className, space, reversed, ...props }: HStackProps) {
	return <View className={cn(hstackVariants({ space, reversed, className }))} {...props} />;
}

export { HStack };
