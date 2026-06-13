import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../../contexts/translations';

/**
 * USB tab body. usb-discovery is an instant enumeration (libusb device list on
 * macOS/Linux, installed spooler queues on Windows), so the list loads itself on
 * mount — the button only re-checks after hot-plugging, since there is no USB
 * attach-event wiring.
 */
export function UsbPrintersSection({
	onScan,
	scanning,
	children,
}: {
	onScan?: () => void;
	scanning?: boolean;
	children?: React.ReactNode;
}) {
	const t = useT();

	// useEffect required: imperative one-shot kick of the usb-discovery IPC scan when
	// the USB tab mounts — there is no user gesture to attach it to, and the result
	// lives in the discovery hook's state, not in render inputs.
	React.useEffect(() => {
		onScan?.();
	}, [onScan]);

	return (
		<VStack className="gap-2">
			{onScan && (
				<Button
					testID="add-printer-electron-usb-scan-button"
					variant="outline"
					size="sm"
					className="self-start"
					onPress={onScan}
					loading={!!scanning}
					disabled={!!scanning}
				>
					<Text>{t('settings.refresh_devices', 'Refresh')}</Text>
				</Button>
			)}
			{children}
		</VStack>
	);
}
