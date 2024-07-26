import * as React from 'react';
import { Linking } from 'react-native';

import { Box } from '@wcpos/tailwind/src/box';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';

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
			<Box className="grow justify-center p-0 pl-7">
				<Button size="sm" variant="link" onPress={() => Linking.openURL('https://wcpos.com/pro')}>
					<ButtonText className="text-sm">{upgradeToProText}</ButtonText>
				</Button>
			</Box>
			<Button
				size="icon"
				variant="ghost"
				className="rounded-full h-5 w-5"
				onPress={() => setShowUpgrade(false)}
			>
				<Icon name="xmark" size="xSmall" />
			</Button>
		</HStack>
	);
};
