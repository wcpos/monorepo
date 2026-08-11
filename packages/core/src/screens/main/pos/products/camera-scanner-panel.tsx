import * as React from 'react';
import { View } from 'react-native';

import { useCameraPermissions } from 'expo-camera';

import { Button, ButtonText } from '@wcpos/components/button';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { VStack } from '@wcpos/components/vstack';

import { ScannerViewfinder } from './scanner-viewfinder';
import { type ViewfinderStatus } from './scanner-viewfinder-types';
import { useCameraScan } from './use-camera-scan';
import { useT } from '../../../../contexts/translations';
import { useCameraScanBus } from '../../hooks/barcodes/camera-scan-context';
import { useEngineStatus } from '../../hooks/use-engine-monitor';
import { useStorageDegraded } from '../../hooks/use-storage-health';

const FLASH_DURATION_MS = 350;

interface CameraScannerPanelProps {
	onClose: () => void;
}

/**
 * Inline camera scanning panel for the POS products screen (#905). Renders in
 * place below the FilterBar — not in a modal — so the cashier can scan
 * continuously while the product grid and cart stay visible and usable.
 * Decoded codes flow through useCameraScan into the shared scan pipeline
 * (dedup/cooldown + check-digit + add-to-cart); an accepted scan flashes the
 * viewfinder border green on top of the pipeline's toast + sound feedback.
 */
export function CameraScannerPanel({ onClose }: CameraScannerPanelProps) {
	const t = useT();
	const [permission, requestPermission] = useCameraPermissions();
	const { onScan, reset } = useCameraScan();
	const { events$ } = useCameraScanBus();
	const engineStatus = useEngineStatus();
	const { status: onlineStatus } = useOnlineStatus();
	const storageDegraded = useStorageDegraded();
	const [status, setStatus] = React.useState<ViewfinderStatus>('initializing');
	const [flash, setFlash] = React.useState(false);
	const flashTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	// Fresh dedup state each time the panel opens so an item scanned in a
	// previous session isn't suppressed.
	React.useEffect(() => {
		reset();
	}, [reset]);

	// Green border flash on each accepted scan (post dedup/cooldown).
	React.useEffect(() => {
		const subscription = events$.subscribe((event) => {
			if (event.source.kind !== 'camera') {
				return;
			}
			setFlash(true);
			clearTimeout(flashTimeout.current);
			flashTimeout.current = setTimeout(() => setFlash(false), FLASH_DURATION_MS);
		});
		return () => {
			subscription.unsubscribe();
			clearTimeout(flashTimeout.current);
		};
	}, [events$]);

	const granted = permission?.granted ?? false;

	const statusMessage = React.useMemo(() => {
		switch (status) {
			case 'initializing':
				return t('pos_products.camera_starting');
			case 'camera-denied':
				return t('pos_products.camera_permission_prompt');
			case 'camera-unavailable':
				return t('pos_products.camera_unavailable');
			case 'decoder-error':
				return t('pos_products.camera_decoder_error');
			default:
				return null;
		}
	}, [status, t]);

	/**
	 * Quiet heads-up when scans may not fully resolve — this replaced the
	 * red outage banner that used to sit above the product grid. Local scanning
	 * still works through an engine outage, so the note informs rather than
	 * alarms; the scan toast carries the actual error if a lookup fails.
	 * Storage loss outranks the rest: with no local database nothing can be
	 * looked up at all.
	 */
	const isEngineNotReady =
		engineStatus.gatedBy === 'lifecycle' || engineStatus.gatedBy === 'bootstrap-failed';
	const readinessMessage = storageDegraded
		? t('pos_products.camera_scan_storage_unavailable')
		: onlineStatus === 'offline'
			? t('pos_products.camera_scan_offline')
			: isEngineNotReady
				? t('pos_products.camera_scan_engine_not_ready')
				: null;

	if (!granted) {
		return (
			<VStack
				space="md"
				className="border-border items-center rounded-md border p-4"
				testID="camera-permission-request"
			>
				<Text className="text-center text-sm">{t('pos_products.camera_permission_prompt')}</Text>
				<Button onPress={requestPermission}>
					<ButtonText>{t('pos_products.camera_permission_grant')}</ButtonText>
				</Button>
			</VStack>
		);
	}

	return (
		<View
			className="relative h-44 w-full overflow-hidden rounded-md bg-black"
			testID="camera-scanner-panel"
		>
			<ScannerViewfinder onScan={onScan} onStatusChange={setStatus} />
			{flash ? (
				<View
					className="border-success pointer-events-none absolute inset-0 rounded-md border-4"
					testID="camera-scanner-flash"
				/>
			) : null}
			<View className="absolute top-1 right-1">
				<IconButton
					name="xmark"
					size="sm"
					onPress={onClose}
					className="text-white"
					testID="camera-scanner-close"
				/>
			</View>
			{statusMessage || readinessMessage ? (
				<View className="absolute inset-x-0 bottom-0 gap-1 bg-black/60 p-2">
					{statusMessage ? (
						<Text className="text-center text-xs text-white" testID="camera-scanner-status">
							{statusMessage}
						</Text>
					) : null}
					{readinessMessage ? (
						<Text className="text-center text-xs text-white/80" testID="camera-scanner-readiness">
							{readinessMessage}
						</Text>
					) : null}
				</View>
			) : null}
		</View>
	);
}
