import * as React from 'react';
import { Platform } from 'react-native';

import { Tabs, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../../contexts/translations';

import type { UseFormReturn } from 'react-hook-form';
import type { PrinterFormValues } from '../../schema';

type ConnType = 'network' | 'bluetooth' | 'usb';

interface ConnectionTypeSegmentedProps {
	form: Pick<UseFormReturn<PrinterFormValues>, 'clearErrors'>;
	value: PrinterFormValues['connectionType'];
	onChange: (value: ConnType) => void;
	availableTypes?: readonly ConnType[];
}

function isConnectionType(value: string): value is ConnType {
	return value === 'network' || value === 'bluetooth' || value === 'usb';
}

export function ConnectionTypeSegmented({
	form,
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
		{ value: 'network', label: t('settings.connection_network') },
		{ value: 'bluetooth', label: t('settings.connection_bluetooth') },
		{ value: 'usb', label: t('settings.connection_usb') },
	];
	const options = allOptions.filter((option) => enabledTypes.includes(option.value));

	return (
		<Tabs
			value={value === 'system' ? 'usb' : value}
			onValueChange={(next) => {
				if (isConnectionType(next)) {
					onChange(next);
					form.clearErrors('address');
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
