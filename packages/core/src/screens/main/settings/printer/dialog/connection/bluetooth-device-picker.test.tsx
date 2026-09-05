/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { BluetoothDevicePicker } from './bluetooth-device-picker';

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

it('applies queried columns when the form still has the default', async () => {
	const form = {
		control: {},
		getValues: jest.fn(() => 42),
		setValue: jest.fn(),
	} as unknown as React.ComponentProps<typeof BluetoothDevicePicker>['form'];
	render(<BluetoothDevicePicker form={form} />);

	fireEvent.click(screen.getByTestId('add-printer-bt-device-epson-bt'));

	await waitFor(() => expect(form.setValue).toHaveBeenCalledWith('columns', 48));
});
