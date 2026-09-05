/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { resolveNativePrinterColumns } from '@wcpos/printer';

import { BluetoothDevicePicker } from './bluetooth-device-picker';
import { UsbDevicePicker } from './usb-device-picker';

jest.mock('@wcpos/printer', () => ({
	resolveNativePrinterColumns: jest.fn(async () => ({ columns: 48, source: 'printer' })),
	usePrinterDiscovery: () => ({
		printers: [
			{
				id: 'epson-bt',
				name: 'TM-m30III',
				connectionType: 'bluetooth',
				address: 'BT:printer',
				vendor: 'epson',
			},
			{
				id: 'epson-usb',
				name: 'TM-m30III',
				connectionType: 'usb',
				address: 'USB:printer',
				vendor: 'epson',
			},
		],
		startScan: jest.fn(),
		isScanning: false,
	}),
}));
jest.mock('react-hook-form', () => ({ useWatch: () => '' }));
jest.mock('react-native', () => ({
	Pressable: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress: () => void; testID: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

function createForm() {
	const values: Record<string, unknown> = { address: '', columns: 42 };
	const setValue = jest.fn((name: string, value: unknown) => {
		values[name] = value;
	});
	const form = {
		control: {},
		getValues: jest.fn((name: string) => values[name]),
		setValue,
	} as unknown as React.ComponentProps<typeof BluetoothDevicePicker>['form'];
	return { form, setValue, values };
}

it('applies queried columns when the form still has the default', async () => {
	const { form, setValue } = createForm();
	render(<BluetoothDevicePicker form={form} />);

	fireEvent.click(screen.getByTestId('add-printer-bt-device-epson-bt'));

	await waitFor(() => expect(setValue).toHaveBeenCalledWith('columns', 48));
});

it.each([
	['Bluetooth', BluetoothDevicePicker, 'add-printer-bt-device-epson-bt', 'BT:new-printer'],
	['USB', UsbDevicePicker, 'add-printer-usb-device-epson-usb', 'USB:new-printer'],
] as const)(
	'does not apply %s columns after the selection changes',
	async (_, Picker, testID, address) => {
		let resolveWidth: (value: { columns: number; source: 'printer' }) => void = () => undefined;
		jest
			.mocked(resolveNativePrinterColumns)
			.mockImplementationOnce(() => new Promise((resolve) => (resolveWidth = resolve)));
		const { form, setValue, values } = createForm();
		render(<Picker form={form} />);

		fireEvent.click(screen.getByTestId(testID));
		values.address = address;
		await act(async () => resolveWidth({ columns: 48, source: 'printer' }));

		expect(setValue).not.toHaveBeenCalledWith('columns', 48);
	}
);

it.each([
	['Bluetooth', BluetoothDevicePicker, 'add-printer-bt-device-epson-bt'],
	['USB', UsbDevicePicker, 'add-printer-usb-device-epson-usb'],
] as const)('does not apply %s columns after columns are edited', async (_, Picker, testID) => {
	let resolveWidth: (value: { columns: number; source: 'printer' }) => void = () => undefined;
	jest
		.mocked(resolveNativePrinterColumns)
		.mockImplementationOnce(() => new Promise((resolve) => (resolveWidth = resolve)));
	const { form, setValue, values } = createForm();
	render(<Picker form={form} />);

	fireEvent.click(screen.getByTestId(testID));
	values.columns = 32;
	await act(async () => resolveWidth({ columns: 48, source: 'printer' }));

	expect(setValue).not.toHaveBeenCalledWith('columns', 48);
});
