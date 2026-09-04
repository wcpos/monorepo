import * as React from 'react';
import { View } from 'react-native';

import { formatDistance } from 'date-fns';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';
import { useT } from '../../../../contexts/translations';
import { useLocalDate } from '../../../../hooks/use-local-date';

import type { DisplayRegistryRow } from '../../../../services/customer-display';

function DisplayRow({
	display,
	observedAt,
	onForget,
}: {
	display: DisplayRegistryRow;
	observedAt: number;
	onForget: (display: DisplayRegistryRow) => void;
}) {
	const t = useT();
	const { dateFnsLocale: locale } = useLocalDate();
	const lastSeen =
		display.last_seen === 0
			? t('settings.customer_display.never')
			: formatDistance(new Date(display.last_seen * 1000), new Date(observedAt), {
					addSuffix: true,
					locale,
				});

	return (
		<SettingsRow
			label={display.name}
			description={t('settings.customer_display.last_seen', {
				time: lastSeen,
			})}
		>
			<HStack className="items-center justify-end gap-3">
				<View
					className={`h-2 w-2 rounded-full ${display.connected ? 'bg-success' : 'bg-muted-foreground/40'}`}
				/>
				<Text
					testID={`customer-display-status-${display.id}`}
					className={display.connected ? 'text-success text-xs' : 'text-muted-foreground text-xs'}
				>
					{display.connected
						? t('settings.customer_display.connected')
						: t('settings.customer_display.disconnected')}
				</Text>
				<Button variant="ghost-quiet" size="sm" onPress={() => onForget(display)}>
					<ButtonText>{t('settings.customer_display.forget')}</ButtonText>
				</Button>
			</HStack>
		</SettingsRow>
	);
}

export function PairedDisplays({
	displays,
	observedAt,
	onForget,
}: {
	displays: DisplayRegistryRow[];
	observedAt: number;
	onForget: (id: string) => Promise<void>;
}) {
	const t = useT();
	const [pendingForget, setPendingForget] = React.useState<DisplayRegistryRow | null>(null);

	const confirmForget = React.useCallback(() => {
		if (!pendingForget) return;
		void onForget(pendingForget.id).catch(() => undefined);
		setPendingForget(null);
	}, [onForget, pendingForget]);

	return (
		<SettingsSection
			testID="customer-display-list"
			title={t('settings.customer_display.paired')}
			description={t('settings.customer_display.paired_description')}
		>
			{displays.length === 0 ? (
				<Text className="text-muted-foreground text-sm">
					{t('settings.customer_display.empty')}
				</Text>
			) : (
				<VStack>
					{displays.map((display) => (
						<DisplayRow
							key={display.id}
							display={display}
							observedAt={observedAt}
							onForget={setPendingForget}
						/>
					))}
				</VStack>
			)}
			<AlertDialog open={!!pendingForget} onOpenChange={(open) => !open && setPendingForget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('settings.customer_display.forget_title')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('settings.customer_display.forget_description', {
								name: pendingForget?.name ?? '',
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={confirmForget}>
							{t('settings.customer_display.forget')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsSection>
	);
}
