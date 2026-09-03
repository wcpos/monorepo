import * as React from 'react';

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
import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { getErrorMessage } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { getDeviceId } from '../../display/device-id';
import { getDisplaySignaling } from '../../display/store';
import { useDisplayApi } from '../../display/use-display-api';
import { useDateFormat } from '../../hooks/use-date-format';
import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

import type { DisplayPairing, PairedDisplay } from '../../display/types';

function DisplayRow({ display, onForget }: { display: PairedDisplay; onForget: () => void }) {
	const t = useT();
	const lastSeen = useDateFormat(display.last_seen);
	return (
		<SettingsRow
			label={display.name}
			description={
				display.connected
					? t('settings.customer_display_connected')
					: t('settings.customer_display_last_seen', { time: lastSeen ?? '—' })
			}
		>
			<Button
				variant="ghost-quiet"
				size="sm"
				onPress={onForget}
				testID={`settings-customer-display-forget-${display.id}`}
			>
				{t('settings.customer_display_forget')}
			</Button>
		</SettingsRow>
	);
}

function CustomerDisplayContent() {
	const t = useT();
	const { site } = useStoreSession();
	const api = useDisplayApi();
	const [displays, setDisplays] = React.useState<PairedDisplay[]>([]);
	const [pairing, setPairing] = React.useState<DisplayPairing | null>(null);
	const [confirming, setConfirming] = React.useState<PairedDisplay | null>(null);
	const [clock, setClock] = React.useState(0);

	const loadDisplays = React.useCallback(async () => {
		try {
			setDisplays(await api.listDisplays());
		} catch (error) {
			Toast.show({ type: 'error', title: t('common.error'), description: getErrorMessage(error) });
		}
	}, [api, t]);

	// This effect performs the required external REST read when the page mounts.
	// eslint-disable-next-line react-hooks/set-state-in-effect -- state changes only after the REST promise settles.
	React.useEffect(() => void loadDisplays(), [loadDisplays]);
	// The interval is an external clock subscription used only while a code is active.
	React.useEffect(() => {
		if (!pairing) return;
		const timer = setInterval(() => setClock(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [pairing]);

	const remaining = pairing
		? Math.max(0, Math.ceil((Date.parse(pairing.expires_at) - clock) / 1000))
		: 0;
	const countdown = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
	const siteHome = (site.home ?? site.url ?? '').replace(/\/+$/, '');

	const pair = async () => {
		try {
			setPairing(await api.createPairing(await getDeviceId()));
			setClock(Date.now());
			await loadDisplays();
		} catch (error) {
			Toast.show({ type: 'error', title: t('common.error'), description: getErrorMessage(error) });
		}
	};
	const forget = async () => {
		if (!confirming) return;
		try {
			await api.forgetDisplay(confirming.id);
			await loadDisplays();
		} catch (error) {
			Toast.show({ type: 'error', title: t('common.error'), description: getErrorMessage(error) });
		} finally {
			setConfirming(null);
		}
	};
	const isElectron = typeof window !== 'undefined' && 'electron' in window;

	return (
		<VStack className="gap-5">
			<SettingsSection first title={t('settings.customer_display_paired')}>
				{displays.length === 0 ? (
					<Text>{t('settings.customer_display_empty')}</Text>
				) : (
					displays.map((display) => (
						<DisplayRow
							key={display.id}
							display={display}
							onForget={() => setConfirming(display)}
						/>
					))
				)}
				<Button
					variant="outline"
					size="sm"
					onPress={loadDisplays}
					testID="settings-customer-display-refresh"
				>
					{t('settings.customer_display_refresh')}
				</Button>
			</SettingsSection>
			<SettingsSection
				title={t('settings.customer_display_pair')}
				description={t('settings.customer_display_instructions', { home: siteHome })}
			>
				{pairing && remaining > 0 ? (
					<VStack className="items-center gap-1 py-3">
						<Text
							className="font-mono text-4xl font-semibold tracking-widest"
							testID="settings-customer-display-code"
						>
							{pairing.code}
						</Text>
						<Text testID="settings-customer-display-countdown">{countdown}</Text>
					</VStack>
				) : (
					<>
						{pairing && <Text>{t('settings.customer_display_expired')}</Text>}
						<Button onPress={pair} testID="settings-customer-display-pair">
							{t('settings.customer_display_pair')}
						</Button>
					</>
				)}
			</SettingsSection>
			{isElectron && (
				<SettingsSection>
					<SettingsRow
						label={t('settings.customer_display_open_second')}
						description={t('settings.customer_display_coming')}
					>
						<Button disabled testID="settings-customer-display-open-second">
							{t('settings.customer_display_open_second')}
						</Button>
					</SettingsRow>
				</SettingsSection>
			)}
			<AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('settings.customer_display_forget_title')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('settings.customer_display_forget_description', { name: confirming?.name ?? '' })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel testID="settings-customer-display-forget-cancel">
							{t('common.cancel')}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onPress={forget}
							testID="settings-customer-display-forget-confirm"
						>
							{t('settings.customer_display_forget')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</VStack>
	);
}

export function CustomerDisplaySettings() {
	const { store } = useStoreSession();
	return getDisplaySignaling(store) ? <CustomerDisplayContent /> : null;
}
