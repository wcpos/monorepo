import * as React from 'react';
import { Platform } from 'react-native';

import { Tabs, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../../contexts/translations';

type ConnType = 'network' | 'bluetooth' | 'usb';

interface ConnectionTypeSegmentedProps {
	value: ConnType;
	onChange: (value: ConnType) => void;
	availableTypes?: readonly ConnType[];
}

function isConnectionType(value: string): value is ConnType {
	return value === 'network' || value === 'bluetooth' || value === 'usb';
}

export function ConnectionTypeSegmented({
	value,
	onChange,
	availableTypes,
}: ConnectionTypeSegmentedProps) {
	const t = useT();
	const defaultTypes: ConnType[] = ['network', 'bluetooth'];
	if (Platform.OS !== 'ios') {
		defaultTypes.push('usb');
	}
	const enabledTypes = availableTypes ?? defaultTypes;
	const allOptions: { value: ConnType; label: string }[] = [
		{ value: 'network', label: t('settings.connection_network', 'Network') },
		{ value: 'bluetooth', label: t('settings.connection_bluetooth', 'Bluetooth') },
		{ value: 'usb', label: t('settings.connection_usb', 'USB') },
	];
	const options = allOptions.filter((option) => enabledTypes.includes(option.value));

	return (
		<Tabs
			value={value}
			onValueChange={(next) => {
				if (isConnectionType(next)) {
					onChange(next);
				}
			}}
		>
			<TabsList testID="add-printer-connection-type-segmented" className="w-full flex-row">
				{options.map((option) => (
					<TabsTrigger
						key={option.value}
						value={option.value}
						testID={`add-printer-connection-type-${option.value}`}
						className="flex-1"
					>
						<Text>{option.label}</Text>
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
