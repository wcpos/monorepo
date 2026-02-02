import * as React from 'react';
import { Linking } from 'react-native';

import { Box } from '@wcpos/components/src/box';
import { HStack } from '@wcpos/components/src/hstack';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';

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
			<Box className="grow justify-center p-0 pl-7">
				<Text
					className="text-sm mx-auto"
					variant="link"
					onPress={() => Linking.openURL('https://wcpos.com/pro')}
				>
					{upgradeToProText}
				</Text>
			</Box>
			<IconButton name="xmark" size="sm" onPress={() => setShowUpgrade(false)} />
		</HStack>
	);
};
