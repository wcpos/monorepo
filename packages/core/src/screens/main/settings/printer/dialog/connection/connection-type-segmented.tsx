import * as React from 'react';
import { Platform } from 'react-native';

import { type Segment, SegmentedControl } from '@wcpos/components/segmented-control';

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

	// One way is no choice: with a single supported type (a browser without WebUSB or Web
	// Bluetooth) there is nothing to switch, so no control is drawn.
	if (options.length < 2) return null;
	const segments = options.map((option): Segment => ({
		value: option.value,
		label: option.label,
		testID: `add-printer-connection-type-${option.value}`,
	})) as unknown as React.ComponentProps<typeof SegmentedControl>['segments']; // 2 or 3, checked above

	// A few-way switch is a SegmentedControl; Tabs are for sections with panels (decision 10).
	return (
		<SegmentedControl
			testID="add-printer-connection-type-segmented"
			className="w-full"
			segments={segments}
			value={value === 'system' ? 'usb' : value}
			onValueChange={(next) => {
				if (isConnectionType(next)) {
					onChange(next);
					form.clearErrors('address');
				}
			}}
		/>
	);
}
