import React from 'react';

import { useIsPhone } from '@wcpos/components/lib/device';
import { Button } from '@wcpos/components/button';
import { cn } from '@wcpos/components/lib/utils';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import { useGround } from '@wcpos/components/lib/ground';

import { useT } from '../../../../contexts/translations';

export function UpgradeNotice({
	setShowUpgrade,
	underBar = false,
}: {
	setShowUpgrade: (show: boolean) => void;
	/**
	 * Mounted as the row under a wide page bar (Orders, Reports, Support): the bar ends at its
	 * controls and leaves the page gutter to this row. Off by default — at the top of the
	 * POS, Settings or Store health column the strip is flush with the edge it already pads.
	 */
	underBar?: boolean;
}) {
	const t = useT();

	const isPhone = useIsPhone();
	const ground = useGround();
	const openPro = () => openExternalURL('https://wcpos.com/pro');

	return (
		// Under a wide bar the strip carries the page gutter above it (CODING_STANDARDS § Design,
		// Gutters); elsewhere, and on the phone, it is flush as before.
		<HStack
			testID="upgrade-notice-banner"
			className={cn(
				'bg-muted border-border min-h-10 items-center gap-2.5 border-b pr-2',
				ground.pl,
				underBar && !isPhone && ground.mt
			)}
		>
			{/* Decorative: the title beside it carries the meaning, so the star is hidden from
			    assistive tech and its contrast is not load-bearing. */}
			<Icon name="featured" size="sm" className="text-muted-foreground" aria-hidden />
			<Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
				<Text className="font-semibold">{t('pro.strip_title')}</Text>
				{!isPhone && <> {t('pro.strip_body')}</>}
			</Text>
			{!isPhone && (
				<Text
					testID="upgrade-notice-more"
					className="text-primary text-sm"
					variant="link"
					onPress={openPro}
				>
					{t('pro.strip_more')}
				</Text>
			)}
			{/* Compact look, 44 pt target: 36 px tall plus 4 px of hit slop each side. */}
			<Button
				testID="upgrade-notice-upgrade"
				size="sm"
				hitSlop={{ top: 4, bottom: 4 }}
				onPress={openPro}
			>
				{t('common.upgrade_to_pro')}
			</Button>
			<IconButton
				testID="upgrade-notice-dismiss"
				name="close"
				size="sm"
				accessibilityLabel={t('pro.strip_dismiss')}
				onPress={() => setShowUpgrade(false)}
			/>
		</HStack>
	);
}
