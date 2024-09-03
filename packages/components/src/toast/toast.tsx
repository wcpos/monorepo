import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { Button, ButtonText } from '../button';
import { HStack } from '../hstack';
import { Text } from '../text';
import { VStack } from '../vstack';

import type { ToastConfigParams } from 'react-native-toast-message';

const toastVariants = cva(
	'min-w-64 rounded-md border-l-4 bg-popover p-4 web:outline-none web:cursor-auto',
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
export const BaseToast = ({ variant, text1, text2, props, ...rest }: ToastProps) => {
	/**
	 *
	 */
	const handleAction = React.useCallback(() => {
		if (props?.action?.action) {
			props.action.action();
		}
		rest.hide();
	}, [props.action, rest]);

	return (
		<View className="border border-border shadow-md rounded-lg max-w-screen-sm">
			<View className={toastVariants({ variant })} role="alert">
				<HStack>
					<VStack className="flex-1">
						{text1 && <Text className="font-bold">{text1}</Text>}
						{text2 && <Text>{text2}</Text>}
					</VStack>
					{props?.action && (
						<Button onPress={handleAction}>
							<ButtonText>{props.action.label}</ButtonText>
						</Button>
					)}
				</HStack>
			</View>
		</View>
	);
};

BaseToast.displayName = 'Toast';
