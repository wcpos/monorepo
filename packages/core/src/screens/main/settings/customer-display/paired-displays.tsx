import * as React from 'react';

import { formatDistance } from 'date-fns/formatDistance';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { DeviceRow, DeviceRowActions } from '@wcpos/components/device-row';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { EmptyState } from '@wcpos/components/empty-state';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

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
		<DeviceRow
			icon="desktop"
			name={display.name}
			identifiers={[t('settings.customer_display.last_seen', { time: lastSeen })]}
			state={{
				tone: display.connected ? 'ok' : 'muted',
				testID: `customer-display-status-${display.id}`,
				label: display.connected
					? t('settings.customer_display.connected')
					: t('settings.customer_display.disconnected'),
			}}
		>
			<DeviceRowActions>
				{/* Forgetting unpairs the display: the last, red row of the row's ⋮ menu. */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton
							name="more"
							testID={`customer-display-menu-${display.id}`}
							accessibilityLabel={t('common.actions')}
						/>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							variant="destructive"
							testID={`customer-display-forget-${display.id}`}
							onPress={() => onForget(display)}
						>
							<Icon name="delete" className="fill-destructive" />
							<Text>{t('settings.customer_display.forget')}</Text>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</DeviceRowActions>
		</DeviceRow>
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
				<EmptyState kind="empty" size="inline" title={t('settings.customer_display.empty')} />
			) : (
				<VStack className="gap-2">
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
					<AlertDialogFooter
						cancel={true}
						confirm={{
							label: t('settings.customer_display.forget'),
							destructive: true,
							onPress: confirmForget,
						}}
					/>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsSection>
	);
}
