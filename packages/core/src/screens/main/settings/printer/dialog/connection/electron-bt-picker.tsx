import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

interface BtDevice {
	id: string;
	name: string;
}
interface ElectronIpc {
	on: (channel: string, cb: (...args: unknown[]) => void) => () => void;
	send: (channel: string, args: unknown) => void;
}

function getIpc(): ElectronIpc | null {
	return (window as unknown as { ipcRenderer?: ElectronIpc }).ipcRenderer ?? null;
}

export function ElectronBtPicker() {
	const [devices, setDevices] = React.useState<BtDevice[]>([]);

	React.useEffect(() => {
		const ipc = getIpc();
		if (!ipc) return;
		const unsub = ipc.on('bluetooth-devices', (...args) => {
			setDevices((args[0] as BtDevice[]) ?? []);
		});
		return unsub;
	}, []);

	const choose = (id: string) => {
		getIpc()?.send('bluetooth-device-selected', id);
		setDevices([]);
	};

	if (devices.length === 0) return null;

	return (
		<VStack className="gap-2">
			{devices.map((d) => (
				<Pressable
					key={d.id}
					testID={`electron-bt-device-${d.id}`}
					onPress={() => choose(d.id)}
					className="border-border flex-row items-center gap-2 rounded-md border p-2"
				>
					<View className="bg-primary h-2 w-2 rounded-full" />
					<Text className="text-sm">{d.name || d.id}</Text>
				</Pressable>
			))}
		</VStack>
	);
}
