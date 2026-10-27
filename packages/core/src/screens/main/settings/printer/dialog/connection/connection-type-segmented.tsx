import * as React from 'react';
import { Platform } from 'react-native';

import { type Segment, SegmentedControl } from '@wcpos/components/segmented-control';

import { useT } from '../../../../../../contexts/translations';
import { PrinterRow } from '../printer-rows';

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
	const current = value === 'system' ? 'usb' : value;
	// A saved type this platform cannot use (a USB printer opened in a browser without WebUSB)
	// stays on show, disabled, so the cashier sees it and can move the profile to a supported one.
	const shown = allOptions.filter(
		(option) => enabledTypes.includes(option.value) || option.value === current
	);
	// One way is no choice: when the only type is the one already set, nothing is drawn.
	if (shown.length < 2) return null;
	const segments = shown.map((option): Segment => ({
		value: option.value,
		label: option.label,
		disabled: !enabledTypes.includes(option.value),
		testID: `add-printer-connection-type-${option.value}`,
	})) as unknown as React.ComponentProps<typeof SegmentedControl>['segments']; // 2 or 3, checked above

	// A few-way switch is a SegmentedControl; Tabs are for sections with panels (decision 10).
	return (
		<PrinterRow id="connection" label={t('settings.printer_connection')} mark="connectionType">
			<SegmentedControl
				testID="add-printer-connection-type-segmented"
				className="w-full"
				segments={segments}
				value={current}
				onValueChange={(next) => {
					if (isConnectionType(next)) {
						onChange(next);
						form.clearErrors('address');
					}
				}}
			/>
		</PrinterRow>
	);
}
