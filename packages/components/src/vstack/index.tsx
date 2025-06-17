import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

const vstackVariants = cva('flex-col', {
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

function VStack({ className, space, reversed, ...props }: VStackProps) {
	return <View className={cn(vstackVariants({ space, reversed, className }))} {...props} />;
}

export { VStack };
