import React from 'react';
import { Linking, View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';

export const UpgradeNotice = ({ setShowUpgrade }) => {
	const t = useT();

	/**
	 *
	 */
	const upgradeToProText = React.useMemo(() => {
		const texts = [
			t('Upgrade to Pro for More Features!', { _tags: 'core' }),
			t('Enjoy More with Pro – Upgrade Today!', { _tags: 'core' }),
			t('Go Pro and Enjoy Exclusive Benefits – Upgrade Now!', { _tags: 'core' }),
			t('Support Our Development – Upgrade to Pro!', { _tags: 'core' }),
			t('Support Our Work – Go Pro Today!', { _tags: 'core' }),
			t('Support Future Updates – Get Pro Now!', { _tags: 'core' }),
		];
		return texts[Math.floor(Math.random() * texts.length)];
	}, [t]);

	return (
		<HStack className="bg-attention">
			<View className="grow justify-center p-0 pl-7">
				<Text
					className="text-attention-foreground mx-auto text-sm"
					variant="link"
					onPress={() => Linking.openURL('https://wcpos.com/pro')}
				>
					{upgradeToProText}
				</Text>
			</View>
			<IconButton
				name="xmark"
				size="sm"
				className="text-attention-foreground"
				onPress={() => setShowUpgrade(false)}
			/>
		</HStack>
	);
};
