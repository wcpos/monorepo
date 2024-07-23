import * as React from 'react';
import { Linking } from 'react-native';

import Icon from '@wcpos/components/src/icon';
import { Box } from '@wcpos/tailwind/src/box';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { HStack } from '@wcpos/tailwind/src/hstack';

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
		<HStack className="bg-amber-50">
			<Box className="grow justify-center p-0">
				<Button size="sm" variant="link" onPress={() => Linking.openURL('https://wcpos.com/pro')}>
					<ButtonText className="text-sm">{upgradeToProText}</ButtonText>
				</Button>
			</Box>
			<Icon name="xmark" size="xSmall" onPress={() => setShowUpgrade(false)} />
		</HStack>
	);
};
