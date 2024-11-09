import * as React from 'react';
import { View, Linking } from 'react-native';

import { Button } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { Image } from '@wcpos/components/src/image';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../contexts/translations';

export const ReportsUpgrade = () => {
	const t = useT();

	return (
		<View className="flex-1 items-center justify-center p-4">
			<View className="w-full flex-col sm:flex-row max-w-3xl">
				<View className="w-full sm:w-1/2 h-60 sm:h-80">
					<Image
						source="https://wcpos.com/reports-upgrade.png"
						className="w-full h-full object-contain"
					/>
				</View>
				<VStack className="w-full sm:w-1/2 p-4 space-y-4">
					<Text className="text-2xl font-bold text-center sm:text-left">
						{t('Upgrade to Pro', { _tags: 'core' })}
					</Text>
					<Text className="text-center sm:text-left">
						{t('Unlock End of Day Reports by upgrading to WooCommerce POS Pro', { _tags: 'core' })}
					</Text>
					<HStack className="space-x-2 justify-center sm:justify-start">
						<Button
							variant="secondary"
							onPress={() => Linking.openURL('https://demo.wcpos.com/pos/reports')}
						>
							{t('View Demo', { _tags: 'core' })}
						</Button>
						<Button onPress={() => Linking.openURL('https://wcpos.com/pro')}>
							{t('Upgrade to Pro', { _tags: 'core' })}
						</Button>
					</HStack>
				</VStack>
			</View>
		</View>
	);
};
