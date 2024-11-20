import * as React from 'react';
import { View, StyleSheet } from 'react-native';

import { Box } from '@wcpos/components/src/box';
import { Button, ButtonText } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';

export const UpgradeRequired = () => {
	const t = useT();
	const { logout } = useAppState();

	return (
		<View
			style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
		>
			<VStack>
				<HStack>
					<Icon name="triangleExclamation" variant="destructive" />
					<Text className="text-destructive">{t('Please update your WooCommerce POS plugin')}</Text>
				</HStack>
				<Box className="justify-center">
					<Button onPress={logout}>
						<ButtonText>{t('Logout')}</ButtonText>
					</Button>
				</Box>
			</VStack>
		</View>
	);
};
