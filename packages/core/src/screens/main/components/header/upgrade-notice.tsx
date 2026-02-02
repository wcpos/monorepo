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
			t('Upgrade to Pro for More Features!'),
			t('Enjoy More with Pro – Upgrade Today!'),
			t('Go Pro and Enjoy Exclusive Benefits – Upgrade Now!'),
			t('Support Our Development – Upgrade to Pro!'),
			t('Support Our Work – Go Pro Today!'),
			t('Support Future Updates – Get Pro Now!'),
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
