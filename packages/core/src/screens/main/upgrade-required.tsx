import * as React from 'react';
import { View, StyleSheet } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

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
				<View className="justify-center p-2">
					<Button onPress={logout}>
						<ButtonText>{t('Logout')}</ButtonText>
					</Button>
				</View>
			</VStack>
		</View>
	);
};
