import React from 'react';
import { Linking, View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';

export function UpgradeNotice({ setShowUpgrade }: { setShowUpgrade: (show: boolean) => void }) {
	const t = useT();

	/**
	 *
	 */
	const upgradeToProText = React.useMemo(() => {
		const texts = [
			t('common.upgrade_to_pro_for_more_features'),
			t('common.enjoy_more_with_pro_–_upgrade'),
			t('common.go_pro_and_enjoy_exclusive_benefits'),
			t('common.support_our_development_–_upgrade_to'),
			t('common.support_our_work_–_go_pro'),
			t('common.support_future_updates_–_get_pro'),
		];
		return texts[Math.floor(Math.random() * texts.length)];
	}, [t]);

	return (
		<HStack testID="upgrade-notice-banner" className="bg-attention">
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
}
