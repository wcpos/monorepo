import * as React from 'react';
import { View } from 'react-native';

import { useCameraPermissions } from 'expo-camera';
import { useObservableEagerState } from 'observable-hooks';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { ScannerViewfinder } from './scanner-viewfinder';
import { type ViewfinderStatus } from './scanner-viewfinder-types';
import { useCameraScan } from './use-camera-scan';
import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useCameraScanBus } from '../../hooks/barcodes/camera-scan-context';

const FLASH_DURATION_MS = 350;

// Resize bounds for the viewfinder. The default matches the original fixed
// height (h-44 = 176px); the minimum keeps enough preview visible to aim a
// barcode, the maximum stops the panel from crowding out the product list.
const MIN_PANEL_HEIGHT = 96;
const MAX_PANEL_HEIGHT = 480;
const DEFAULT_PANEL_HEIGHT = 176;
const PANEL_HEIGHT_STEP = 16;

const clampPanelHeight = (height: number) =>
	Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(height)));

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
 *
 * The panel height is adjustable via the grip handle under the viewfinder and
 * persists in the pos-products ui-settings (`scannerHeight`), alongside the
 * persisted column width.
 */
export function CameraScannerPanel({ onClose }: CameraScannerPanelProps) {
	const t = useT();
	const [permission, requestPermission] = useCameraPermissions();
	const { onScan, reset } = useCameraScan();
	const { events$ } = useCameraScanBus();
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const savedHeight = useObservableEagerState(uiSettings.scannerHeight$);
	const [status, setStatus] = React.useState<ViewfinderStatus>('initializing');
	const [flash, setFlash] = React.useState(false);
	const flashTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	// While a resize gesture is active, dragHeight overrides the persisted
	// height. pendingHeight becomes the next gesture's baseline immediately on
	// finalize, before the ui-settings write echoes back. Like the reports chart,
	// gesture callbacks use state rather than refs so react-compiler lint stays
	// satisfied.
	const [dragHeight, setDragHeight] = React.useState<number | null>(null);
	const [pendingHeight, setPendingHeight] = React.useState<number | null>(null);
	const committedHeight = pendingHeight ?? clampPanelHeight(savedHeight ?? DEFAULT_PANEL_HEIGHT);
	const height = dragHeight ?? committedHeight;

	// Clear local overrides when a persisted height arrives, either from our own
	// write or an external ui-settings reset while the panel is open.
	React.useEffect(() => {
		const subscription = uiSettings.scannerHeight$.subscribe((persistedHeight) => {
			if (pendingHeight === null || persistedHeight === pendingHeight) {
				setPendingHeight(null);
				setDragHeight(null);
			}
		});
		return () => subscription.unsubscribe();
	}, [pendingHeight, uiSettings]);

	const commitHeight = React.useCallback(
		(nextHeight: number) => {
			const boundedHeight = clampPanelHeight(nextHeight);
			setPendingHeight(boundedHeight);
			setDragHeight(boundedHeight);
			void patchUI({ scannerHeight: boundedHeight });
		},
		[patchUI]
	);

	const resizeGesture = React.useMemo(
		() =>
			Gesture.Pan()
				.runOnJS(true)
				.onUpdate((event) => {
					setDragHeight(clampPanelHeight(committedHeight + event.translationY));
				})
				// onFinalize rather than onEnd so a cancelled gesture still
				// persists (or reverts to) a height consistent with the UI.
				.onFinalize((event) => {
					commitHeight(committedHeight + event.translationY);
				}),
		[commitHeight, committedHeight]
	);

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
		<View className="w-full">
			<View
				className="relative w-full overflow-hidden rounded-md bg-black"
				style={{ height }}
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
				{statusMessage ? (
					<View className="absolute inset-x-0 bottom-0 bg-black/60 p-2">
						<Text className="text-center text-xs text-white" testID="camera-scanner-status">
							{statusMessage}
						</Text>
					</View>
				) : null}
			</View>
			<GestureDetector gesture={resizeGesture}>
				<View
					className="web:cursor-ns-resize web:hover:opacity-100 items-center justify-center py-1 opacity-40"
					style={{ minHeight: 44 }}
					accessible
					accessibilityLabel={t('pos_products.camera_resize_handle')}
					accessibilityRole="adjustable"
					accessibilityValue={{
						min: MIN_PANEL_HEIGHT,
						max: MAX_PANEL_HEIGHT,
						now: height,
					}}
					accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
					onAccessibilityAction={(event) => {
						if (event.nativeEvent.actionName === 'increment') {
							commitHeight(committedHeight + PANEL_HEIGHT_STEP);
						} else if (event.nativeEvent.actionName === 'decrement') {
							commitHeight(committedHeight - PANEL_HEIGHT_STEP);
						}
					}}
					testID="camera-scanner-resize-handle"
				>
					<Icon name="gripLines" className="-my-0.5" />
				</View>
			</GestureDetector>
		</View>
	);
}
