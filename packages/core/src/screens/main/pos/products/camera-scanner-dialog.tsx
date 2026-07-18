import * as React from 'react';
import { View } from 'react-native';

import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';

import { Button, ButtonText } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { CAMERA_BARCODE_TYPES, useCameraScan } from './use-camera-scan';
import { useT } from '../../../../contexts/translations';

/**
 * Camera barcode scanning for the POS products screen. A scan button opens a
 * continuous viewfinder; decoded codes flow through useCameraScan into the
 * shared scan pipeline (dedup/cooldown + check-digit + add-to-cart), so the
 * dialog stays open for rapid checkout scanning.
 */
export function CameraScannerDialog() {
	const t = useT();
	const [open, setOpen] = React.useState(false);
	const [permission, requestPermission] = useCameraPermissions();
	const { onScan, reset, prepareDecoder } = useCameraScan();

	const handleOpenChange = React.useCallback(
		(next: boolean) => {
			if (next) {
				prepareDecoder();
				reset();
			}
			setOpen(next);
		},
		[prepareDecoder, reset]
	);

	const handleBarcode = React.useCallback(
		(result: BarcodeScanningResult) => {
			onScan({ data: result.data, type: result.type });
		},
		[onScan]
	);

	const granted = permission?.granted ?? false;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<IconButton
				name="barcodeScan"
				onPress={() => handleOpenChange(true)}
				testID="camera-scan-button"
			/>
			<DialogContent size="lg" testID="camera-scanner-dialog">
				<DialogHeader>
					<DialogTitle>
						{t('pos_products.camera_scan_title', { defaultValue: 'Scan barcode' })}
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					{granted ? (
						<View className="aspect-square w-full overflow-hidden rounded-md bg-black">
							<CameraView
								style={{ flex: 1 }}
								facing="back"
								barcodeScannerSettings={{ barcodeTypes: [...CAMERA_BARCODE_TYPES] }}
								onBarcodeScanned={handleBarcode}
							/>
						</View>
					) : (
						<VStack space="md" className="items-center p-4" testID="camera-permission-request">
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
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
