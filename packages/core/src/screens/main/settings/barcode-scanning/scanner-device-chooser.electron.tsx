import * as React from 'react';
import { Pressable } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';

/**
 * Electron device chooser for direct scanner connection (#742). In a browser
 * `navigator.serial.requestPort()` / `navigator.hid.requestDevice()` show the
 * platform chooser; in the Electron shell the main process instead surfaces its
 * candidates over the `serial-ports` / `hid-devices` channels and blocks on a
 * reply. This inline picker lists them and replies with the chosen id (or an
 * empty string to cancel), unblocking the pending request — mirroring the
 * Bluetooth chooser flow. Rendered only on Electron; the base component is inert.
 */

interface ScannerCandidate {
	id: string;
	name: string;
}

type DeviceKind = 'serial' | 'hid';

interface ScannerIpcRenderer {
	on: (channel: string, listener: (devices: ScannerCandidate[]) => void) => () => void;
	send: (channel: string, id: string) => void;
}

function getIpc(): ScannerIpcRenderer | null {
	const w = window as unknown as {
		ipcRenderer?: ScannerIpcRenderer;
		electronAPI?: { ipcRenderer?: ScannerIpcRenderer };
	};
	return w.ipcRenderer ?? w.electronAPI?.ipcRenderer ?? null;
}

const REPLY_CHANNEL: Record<DeviceKind, string> = {
	serial: 'serial-port-selected',
	hid: 'hid-device-selected',
};

export function ScannerDeviceChooser() {
	const t = useT();
	const [kind, setKind] = React.useState<DeviceKind | null>(null);
	const [candidates, setCandidates] = React.useState<ScannerCandidate[]>([]);

	// Subscribes to the main-process chooser pushes; an external event source, so
	// an effect (with teardown) is required rather than derived render state.
	React.useEffect(() => {
		const ipc = getIpc();
		if (!ipc?.on) {
			return undefined;
		}
		const offSerial = ipc.on('serial-ports', (devices) => {
			setKind('serial');
			setCandidates(Array.isArray(devices) ? devices : []);
		});
		const offHid = ipc.on('hid-devices', (devices) => {
			setKind('hid');
			setCandidates(Array.isArray(devices) ? devices : []);
		});
		return () => {
			offSerial?.();
			offHid?.();
		};
	}, []);

	const reply = React.useCallback((id: string) => {
		const ipc = getIpc();
		// Capture kind before clearing so the correct reply channel is used.
		setKind((current) => {
			if (current && ipc) {
				ipc.send(REPLY_CHANNEL[current], id);
			}
			return null;
		});
		setCandidates([]);
	}, []);

	if (!kind) {
		return null;
	}

	return (
		<VStack
			space="sm"
			className="border-info/40 bg-info/10 rounded-md border p-2"
			testID="scanner-device-chooser"
		>
			<Text className="text-sm font-medium">
				{t('settings.scanner_choose_device', { defaultValue: 'Choose a scanner to connect' })}
			</Text>
			{candidates.length === 0 ? (
				<Text className="text-muted-foreground text-xs">
					{t('settings.scanner_searching_devices', { defaultValue: 'Searching for devices…' })}
				</Text>
			) : (
				candidates.map((device) => (
					<Pressable
						key={device.id}
						testID={`scanner-device-${device.id}`}
						onPress={() => reply(device.id)}
						className="border-border flex-row items-center gap-2 rounded-md border p-2"
					>
						<Text className="text-sm">{device.name}</Text>
					</Pressable>
				))
			)}
			<Button
				variant="outline"
				size="sm"
				className="self-start"
				onPress={() => reply('')}
				testID="scanner-device-cancel"
			>
				<ButtonText>{t('common.cancel')}</ButtonText>
			</Button>
		</VStack>
	);
}
