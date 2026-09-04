import * as React from 'react';
import { Platform, View } from 'react-native';

import { formatDistance } from 'date-fns';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';
import { useT } from '../../../../contexts/translations';
import { useLocalDate } from '../../../../hooks/use-local-date';

import type { PairingCode as PairingCodeValue } from '../../../../services/customer-display';

export function PairingCode({
	disabled,
	observedAt,
	pairingCode,
	url,
	onMint,
}: {
	disabled: boolean;
	observedAt: number;
	pairingCode: PairingCodeValue | null;
	url: string;
	onMint: () => Promise<unknown>;
}) {
	const t = useT();
	const { dateFnsLocale } = useLocalDate();
	const expiresAt = pairingCode
		? formatDistance(new Date(pairingCode.expires_at * 1000), new Date(observedAt), {
				addSuffix: true,
				locale: dateFnsLocale,
			})
		: null;

	const copyUrl = React.useCallback(() => {
		const clipboard = navigator.clipboard;
		if (typeof clipboard?.writeText !== 'function') return;
		void clipboard.writeText(url).catch(() => undefined);
	}, [url]);

	return (
		<SettingsSection
			first
			title={t('settings.customer_display.pair')}
			description={t('settings.customer_display.pair_description')}
		>
			{pairingCode ? (
				<View className="bg-muted items-center gap-1 rounded-md p-4">
					<Text testID="customer-display-pairing-code" className="font-mono text-3xl font-semibold">
						{pairingCode.code}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{t('settings.customer_display.code_expires', { time: expiresAt })}
					</Text>
				</View>
			) : null}
			<Button
				testID="customer-display-pair-button"
				disabled={disabled}
				onPress={() => void onMint().catch(() => undefined)}
			>
				<ButtonText>{t('settings.customer_display.generate_code')}</ButtonText>
			</Button>
			<SettingsRow label={t('settings.customer_display.display_url')}>
				<VStack className="items-end gap-2">
					<Text selectable testID="customer-display-host-url" className="font-mono text-xs">
						{url}
					</Text>
					{Platform.OS === 'web' ? (
						<HStack className="gap-2">
							<Button variant="outline" size="sm" onPress={copyUrl}>
								<ButtonText>{t('settings.customer_display.copy_url')}</ButtonText>
							</Button>
							<Button variant="outline" size="sm" onPress={() => void openExternalURL(url)}>
								<ButtonText>{t('settings.customer_display.open_in_browser')}</ButtonText>
							</Button>
						</HStack>
					) : null}
				</VStack>
			</SettingsRow>
		</SettingsSection>
	);
}
