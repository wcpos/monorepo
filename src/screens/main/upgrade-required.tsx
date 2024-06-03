import * as React from 'react';
import { View, StyleSheet } from 'react-native';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';

export const UpgradeRequired = () => {
	const t = useT();
	const { logout } = useAppState();

	return (
		<View
			style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
		>
			<Box space="normal">
				<Box horizontal space="small">
					<Icon name="triangleExclamation" type="critical" />
					<Text type="critical">{t('Please update your WooCommerce POS plugin')}</Text>
				</Box>
				<Box align="center">
					<Button onPress={logout}>{t('Logout')}</Button>
				</Box>
			</Box>
		</View>
	);
};
