import React from 'react';

import { useUniwind } from 'uniwind';

import { useIsPhone } from '@wcpos/components/lib/device';
import { Button } from '@wcpos/components/button';
import { isLightTheme } from '@wcpos/components/lib/themes';
import { cn } from '@wcpos/components/lib/utils';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import { useGround } from '@wcpos/components/lib/ground';

import { useT } from '../../../../contexts/translations';

/** The strip's ground: the Notice band's wash on a light theme, the solid warning on a dark one
 * (the dark palette's --warning-bg is a brown tint, not yellow; Paul, 2026-11-02). */
export const upgradeNoticeGround = (light: boolean) => (light ? 'bg-warning-bg' : 'bg-warning');

export function UpgradeNotice({ setShowUpgrade }: { setShowUpgrade: (show: boolean) => void }) {
	const t = useT();
	const light = isLightTheme(useUniwind().theme);

	const isPhone = useIsPhone();
	const ground = useGround();
	const openPro = () => openExternalURL('https://wcpos.com/pro');

	return (
		<HStack
			testID="upgrade-notice-banner"
			className={cn(
				'min-h-10 items-center gap-2.5 pr-2',
				light && 'border-warning/45 border-b',
				upgradeNoticeGround(light),
				ground.pl
			)}
		>
			{/* Decorative: the title beside it carries the meaning, so the star is hidden from
			    assistive tech and its contrast is not load-bearing. */}
			<Icon
				name="featured"
				size="sm"
				className={light ? 'text-foreground' : 'text-warning-foreground'}
				aria-hidden
			/>
			<Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
				<Text className={cn('font-semibold', !light && 'text-warning-foreground')}>
					{t('pro.strip_title')}
				</Text>
				{!isPhone && (
					<Text className={light ? 'text-muted-foreground' : 'text-warning-foreground/80'}>
						{' '}
						{t('pro.strip_body')}
					</Text>
				)}
			</Text>
			{!isPhone && (
				<Text
					testID="upgrade-notice-more"
					className={cn(
						'text-sm underline',
						light ? 'text-warning-text' : 'text-warning-foreground'
					)}
					variant="link"
					onPress={openPro}
				>
					{t('pro.strip_more')}
				</Text>
			)}
			{/* Compact look, 44 pt target: 36 px tall plus 4 px of hit slop each side. */}
			<Button
				testID="upgrade-notice-upgrade"
				variant={light ? 'default' : 'on-warning'}
				size="sm"
				hitSlop={{ top: 4, bottom: 4 }}
				onPress={openPro}
			>
				{t('common.upgrade_to_pro')}
			</Button>
			{/* On the solid amber the default accent wash would paint a grey square: `bare` has no wash of
			    its own, so the ink tint below is the only one (cva concatenates, it does not merge). */}
			<IconButton
				testID="upgrade-notice-dismiss"
				variant={light ? undefined : 'bare'}
				iconClassName={light ? undefined : 'text-warning-foreground'}
				className={
					light ? undefined : 'web:hover:bg-warning-foreground/10 active:bg-warning-foreground/10'
				}
				name="close"
				size="sm"
				accessibilityLabel={t('pro.strip_dismiss')}
				onPress={() => setShowUpgrade(false)}
			/>
		</HStack>
	);
}
