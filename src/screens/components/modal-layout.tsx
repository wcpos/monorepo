import * as React from 'react';
import { View } from 'react-native';

import { useNavigation, StackActions } from '@react-navigation/native';

import { Box } from '@wcpos/components/src/box';
import { Button, ButtonText } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { ModalOverlay, ModalContent } from '@wcpos/components/src/modal';
import { Suspense } from '@wcpos/components/src/suspense';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import useModalRefreshFix from '../../hooks/use-modal-refresh-fix';

/**
 *
 */
export const ModalLayout = ({ children, ...props }) => {
	const navigation = useNavigation();
	useModalRefreshFix();

	return (
		<ModalOverlay>
			<ModalContent>
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
			</ModalContent>
		</ModalOverlay>
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
