import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { Text } from '../text';
import { VStack } from '../vstack';

import type { ToastConfigParams } from 'react-native-toast-message';

const toastVariants = cva(
	'min-w-64 rounded-md border-l-4 bg-popover p-2 shadow-md shadow-foreground/5 web:outline-none web:cursor-auto',
	{
		variants: {
			variant: {
				info: 'border-l-info',
				success: 'border-l-success',
				error: 'border-l-error',
			},
		},
		defaultVariants: {
			variant: 'success',
		},
	}
);

export type ToastProps = ToastConfigParams<{
	dismissable: boolean;
	action: { label: string; action: (props: any) => any };
}> &
	VariantProps<typeof toastVariants>;

/**
 *
 */
export const Toast = ({ variant, text1, text2, props, ...rest }: ToastProps) => {
	console.log('Toast', rest);
	return (
		<View className={toastVariants({ variant })} role="alert">
			<VStack>
				{text1 && <Text className="font-bold">{text1}</Text>}
				{text2 && <Text>{text2}</Text>}
			</VStack>
		</View>
	);
};

Toast.displayName = 'Toast';
