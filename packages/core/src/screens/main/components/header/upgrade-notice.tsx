import React from 'react';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';

export function UpgradeNotice({ setShowUpgrade }: { setShowUpgrade: (show: boolean) => void }) {
	const t = useT();

	const { screenSize } = useTheme();
	const isPhone = screenSize === 'sm';
	const openPro = () => openExternalURL('https://wcpos.com/pro');

	return (
		<HStack
			testID="upgrade-notice-banner"
			className="bg-warn-bg border-warning/45 min-h-10 items-center gap-2.5 border-b pr-2 pl-4"
		>
			<Icon name="star" size="sm" className="text-warning" />
			<Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
				<Text className="font-semibold">{t('pro.strip_title')}</Text>
				{!isPhone && <> {t('pro.strip_body')}</>}
			</Text>
			{!isPhone && (
				<Text
					testID="upgrade-notice-more"
					className="text-muted-foreground text-sm underline"
					variant="link"
					onPress={openPro}
				>
					{t('pro.strip_more')}
				</Text>
			)}
			<Button testID="upgrade-notice-upgrade" size="sm" onPress={openPro}>
				{t('common.upgrade_to_pro')}
			</Button>
			<IconButton
				testID="upgrade-notice-dismiss"
				name="xmark"
				size="sm"
				accessibilityLabel={t('pro.strip_dismiss')}
				onPress={() => setShowUpgrade(false)}
			/>
		</HStack>
	);
}
