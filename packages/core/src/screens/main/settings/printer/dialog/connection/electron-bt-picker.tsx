import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { BluetoothCandidate } from '@wcpos/printer';

/** Chooser candidates forwarded from the Electron main process. Dumb list — the
 * discovery hook owns the IPC subscription and session lifecycle. */
export function ElectronBtPicker({
	candidates,
	onSelect,
}: {
	candidates: BluetoothCandidate[];
	onSelect: (id: string) => void;
}) {
	if (candidates.length === 0) return null;

	return (
		<VStack className="gap-2">
			{candidates.map((d) => (
				<Pressable
					key={d.id}
					testID={`electron-bt-device-${d.id}`}
					onPress={() => onSelect(d.id)}
					className="border-border flex-row items-center gap-2 rounded-md border p-2"
				>
					<View className="bg-primary h-2 w-2 rounded-full" />
					<Text className="text-sm">{d.name || d.id}</Text>
				</Pressable>
			))}
		</VStack>
	);
}
