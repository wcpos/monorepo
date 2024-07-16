import * as React from 'react';
import { View } from 'react-native';

import { useNavigation, StackActions } from '@react-navigation/native';

import Modal, { ModalProps } from '@wcpos/components/src/modal';
import Suspense from '@wcpos/components/src/suspense';
import { Box } from '@wcpos/tailwind/src/box';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import useModalRefreshFix from '../../hooks/use-modal-refresh-fix';

type ModalLayoutProps = Omit<ModalProps, 'opened' | 'onClose'>;

/**
 *
 */
export const ModalLayout = ({ children, ...props }: ModalLayoutProps) => {
	const navigation = useNavigation();
	useModalRefreshFix();

	return (
		<Box>
			<VStack>
				<HStack>
					<Box className="flex-1">
						<Text>Heading</Text>
					</Box>
					<Button onPress={() => navigation.dispatch(StackActions.pop(1))}>
						<ButtonText>Close</ButtonText>
					</Button>
				</HStack>
				<Suspense>{children}</Suspense>
			</VStack>
		</Box>
	);

	// return (
	// 	<Modal
	// 		size="large"
	// 		{...props}
	// 		withPortal={false}
	// 		opened
	// 		onClose={() => navigation.dispatch(StackActions.pop(1))}
	// 	>
	// 		<Suspense>{children}</Suspense>
	// 	</Modal>
	// );
};
