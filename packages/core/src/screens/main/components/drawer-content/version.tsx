import * as React from 'react';
import { Linking, Pressable } from 'react-native';

import { Button } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/dialog';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useT } from '@wcpos/core/contexts/translations';
import { useTheme } from '@wcpos/core/contexts/theme';
import { useAppInfo } from '@wcpos/core/hooks/use-app-info';

/**
 * Row component for displaying version info
 */
function InfoRow({ label, value }: { label: string; value: string | undefined }) {
	if (!value) return null;
	return (
		<HStack className="justify-between">
			<Text className="text-muted-foreground">{label}</Text>
			<Text className="font-mono">{value}</Text>
		</HStack>
	);
}

/**
 * About Dialog content
 */
function AboutDialogContent() {
	const t = useT();
	const { appVersion, platformVersion, platform, site, license } = useAppInfo();

	const platformLabels: Record<string, string> = {
		ios: 'iOS',
		android: 'Android',
		web: 'Web',
		electron: 'Desktop',
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle>{t('About WCPOS')}</DialogTitle>
			</DialogHeader>
			<DialogBody>
				<VStack space="md">
					{/* App Info Section */}
					<VStack space="xs">
						<Text className="text-muted-foreground text-xs font-semibold uppercase">
							{t('Application')}
						</Text>
						<InfoRow label={t('App Version')} value={appVersion} />
						<InfoRow
							label={t('{platform} Version', {platform: platformLabels[platform] })}
							value={platformVersion !== appVersion ? platformVersion : undefined}
						/>
						<InfoRow label={t('Platform')} value={platformLabels[platform]} />
					</VStack>

					{/* Server Info Section (if connected) */}
					{site && (
						<VStack space="xs">
							<Text className="text-muted-foreground text-xs font-semibold uppercase">
								{t('Server')}
							</Text>
							{/* Show Pro version if present, otherwise show free version */}
							{site.wcposProVersion ? (
								<InfoRow
									label={t('WCPOS Pro Plugin')}
									value={site.wcposProVersion}
								/>
							) : (
								<InfoRow label={t('WCPOS Plugin')} value={site.wcposVersion} />
							)}
							<InfoRow label={t('WooCommerce')} value={site.wcVersion} />
							<InfoRow label={t('WordPress')} value={site.wpVersion} />
						</VStack>
					)}

					{/* License Section (if connected) */}
					{license && (
						<VStack space="xs">
							<Text className="text-muted-foreground text-xs font-semibold uppercase">
								{t('License')}
							</Text>
							<InfoRow
								label={t('Status')}
								value={license.isPro ? t('Pro') : t('Free')}
							/>
						</VStack>
					)}
				</VStack>
			</DialogBody>
			<DialogFooter>
				<Button variant="outline" onPress={() => Linking.openURL('https://updates.wcpos.com')}>
					<HStack>
						<Icon name="globe" size="sm" />
						<Text>{t('Release Notes')}</Text>
					</HStack>
				</Button>
			</DialogFooter>
		</>
	);
}

/**
 * Version display with About dialog
 */
const Version = () => {
	const { screenSize } = useTheme();
	const { appVersion } = useAppInfo();

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Pressable>
					<Text
						className={cn(
							'text-sidebar-foreground text-3xs p-2 px-4 opacity-50 active:opacity-100',
							screenSize === 'lg' && 'px-0 text-center'
						)}
					>
						{screenSize === 'lg' ? `v ${appVersion}` : `Version ${appVersion}`}
					</Text>
				</Pressable>
			</DialogTrigger>
			<DialogContent size="sm">
				<AboutDialogContent />
			</DialogContent>
		</Dialog>
	);
};

export default Version;
