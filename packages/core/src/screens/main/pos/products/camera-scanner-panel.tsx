import * as React from 'react';
import { View } from 'react-native';

import { useCameraPermissions } from 'expo-camera';

import { Button, ButtonText } from '@wcpos/components/button';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { ScannerViewfinder } from './scanner-viewfinder';
import { type ViewfinderStatus } from './scanner-viewfinder-types';
import { useCameraScan } from './use-camera-scan';
import { useT } from '../../../../contexts/translations';
import { useCameraScanBus } from '../../hooks/barcodes/camera-scan-context';

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
				return t('pos_products.camera_starting', { defaultValue: 'Starting camera…' });
			case 'camera-denied':
				return t('pos_products.camera_permission_prompt', {
					defaultValue: 'WCPOS needs camera access to scan barcodes.',
				});
			case 'camera-unavailable':
				return t('pos_products.camera_unavailable', {
					defaultValue: 'Camera unavailable — check that no other app is using it.',
				});
			case 'decoder-error':
				return t('pos_products.camera_decoder_error', {
					defaultValue: 'Barcode decoding is failing — close the scanner and try again.',
				});
			default:
				return null;
		}
	}, [status, t]);

	if (!granted) {
		return (
			<VStack
				space="md"
				className="border-border items-center rounded-md border p-4"
				testID="camera-permission-request"
			>
				<Text className="text-center text-sm">
					{t('pos_products.camera_permission_prompt', {
						defaultValue: 'WCPOS needs camera access to scan barcodes.',
					})}
				</Text>
				<Button onPress={requestPermission}>
					<ButtonText>
						{t('pos_products.camera_permission_grant', { defaultValue: 'Allow camera' })}
					</ButtonText>
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
					iconClassName="text-white"
					testID="camera-scanner-close"
				/>
			</View>
			{statusMessage ? (
				<View className="absolute inset-x-0 bottom-0 bg-black/60 p-2">
					<Text className="text-center text-xs text-white" testID="camera-scanner-status">
						{statusMessage}
					</Text>
				</View>
			) : null}
		</View>
	);
}
