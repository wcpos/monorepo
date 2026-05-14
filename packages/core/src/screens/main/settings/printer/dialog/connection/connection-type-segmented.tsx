import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../../contexts/translations';

type ConnType = 'network' | 'bluetooth' | 'usb';

interface ConnectionTypeSegmentedProps {
	value: ConnType;
	onChange: (value: ConnType) => void;
}

export function ConnectionTypeSegmented({ value, onChange }: ConnectionTypeSegmentedProps) {
	const t = useT();
	const options: { value: ConnType; label: string }[] = [
		{ value: 'network', label: t('settings.connection_network', 'Network') },
		{ value: 'bluetooth', label: t('settings.connection_bluetooth', 'Bluetooth') },
	];
	if (Platform.OS !== 'ios') {
		options.push({ value: 'usb', label: t('settings.connection_usb', 'USB') });
	}
	return (
		<View
			testID="add-printer-connection-type-segmented"
			className="bg-muted flex-row gap-1 rounded-md p-1"
		>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<Pressable
						key={option.value}
						testID={`add-printer-connection-type-${option.value}`}
						onPress={() => onChange(option.value)}
						className={`flex-1 items-center rounded px-2 py-2 ${selected ? 'bg-background' : ''}`}
					>
						<Text className={`text-sm ${selected ? 'font-medium' : 'text-muted-foreground'}`}>
							{option.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}
