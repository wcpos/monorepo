import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';

import { useT } from '../../../../contexts/translations';

/**
 *
 */
export const ResetUISettingsButton = ({ onPress }) => {
	const t = useT();

	return (
		<View className="flex-row">
			<Button variant="destructive" onPress={onPress}>
				<ButtonText>{t('Restore Default Settings', { _tags: 'core' })}</ButtonText>
			</Button>
		</View>
	);
};
