/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { DiscoveredPrinter } from '@wcpos/printer';

import { InstalledPrintersSection } from './installed-printers-section';

import type { PrinterFormValues } from '../../schema';
import type { UseFormReturn } from 'react-hook-form';

jest.mock('react-native', () => ({
	Pressable: ({
		children,
		onPress,
		testID,
	}: {
		children?: React.ReactNode;
		onPress?: () => void;
		testID?: string;
	}) => (
		<button type="button" data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

function makeForm(): { form: UseFormReturn<PrinterFormValues>; setValue: jest.Mock } {
	const setValue = jest.fn();
	return { form: { setValue } as unknown as UseFormReturn<PrinterFormValues>, setValue };
}

const printers: DiscoveredPrinter[] = [
	{
		id: 'w1',
		name: 'EPSON TM-T20III',
		connectionType: 'usb',
		address: 'winspool:EPSON TM-T20III',
		vendor: 'generic',
	},
	{
		id: 'u1',
		name: 'Raw USB',
		connectionType: 'usb',
		address: 'usb:1208:514:1:4',
		vendor: 'generic',
	},
];

describe('InstalledPrintersSection', () => {
	it('auto-loads on mount and lists only winspool printers', () => {
		const onScan = jest.fn();
		render(<InstalledPrintersSection form={makeForm().form} printers={printers} onScan={onScan} />);
		expect(onScan).toHaveBeenCalledTimes(1);
		expect(screen.getByText('EPSON TM-T20III')).toBeInTheDocument();
		expect(screen.queryByText('Raw USB')).not.toBeInTheDocument();
	});

	it('selection fills address and name but not connectionType', () => {
		const { form, setValue } = makeForm();
		render(<InstalledPrintersSection form={form} printers={printers} onScan={jest.fn()} />);
		fireEvent.click(screen.getByTestId('add-printer-installed-device-w1'));
		expect(setValue).toHaveBeenCalledWith('address', 'winspool:EPSON TM-T20III');
		expect(setValue).toHaveBeenCalledWith('name', 'EPSON TM-T20III');
		expect(setValue).not.toHaveBeenCalledWith('connectionType', expect.anything());
	});

	it('shows the empty message when nothing is installed', () => {
		render(<InstalledPrintersSection form={makeForm().form} printers={[]} onScan={jest.fn()} />);
		expect(screen.getByText('No installed printers found.')).toBeInTheDocument();
	});
});
