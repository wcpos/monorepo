/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { DiscoveredPrinter } from '@wcpos/printer';

import { OsPrintersSection } from './os-printers-section';

import type { PrinterFormValues } from '../../schema';
import type { UseFormReturn } from 'react-hook-form';

jest.mock('react-native', () => ({
	Pressable: ({
		children,
		onPress,
		testID,
		className,
	}: {
		children?: React.ReactNode;
		onPress?: () => void;
		testID?: string;
		className?: string;
	}) => (
		<button type="button" data-testid={testID} data-classname={className} onClick={onPress}>
			{children}
		</button>
	),
	View: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
		<div data-classname={className}>{children}</div>
	),
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('react-hook-form', () => ({
	useWatch: () => '',
}));

function makeForm(): { form: UseFormReturn<PrinterFormValues>; setValue: jest.Mock } {
	const setValue = jest.fn();
	return {
		form: { setValue, control: {} } as unknown as UseFormReturn<PrinterFormValues>,
		setValue,
	};
}

const winspoolPrinters: DiscoveredPrinter[] = [
	{
		id: 'w1',
		name: 'EPSON TM-T20III',
		connectionType: 'system',
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

const serialPrinters: DiscoveredPrinter[] = [
	{
		id: 's1',
		name: 'Star TSP100',
		connectionType: 'bluetooth',
		address: 'serial:/dev/tty.Star-TSP100-SerialPort-1',
		vendor: 'star',
	},
	{
		id: 'b1',
		name: 'BLE Printer',
		connectionType: 'bluetooth',
		address: 'ble:AA:BB:CC:DD:EE:FF',
		vendor: 'generic',
	},
];

const winspoolProps = {
	targetKind: 'winspool' as const,
	heading: 'Installed printers',
	hint: 'Printers paired in Windows (including Bluetooth printers) appear here as installed printers.',
	emptyText: 'No installed printers found.',
	loadingText: 'Loading installed printers…',
	testIdPrefix: 'add-printer-installed-device',
};

const serialProps = {
	targetKind: 'serial' as const,
	heading: 'Paired Bluetooth printers',
	hint: 'Bluetooth Classic printers paired in your system settings appear here.',
	emptyText: 'No paired printers found.',
	loadingText: 'Loading paired printers…',
	testIdPrefix: 'add-printer-paired-device',
};

describe('OsPrintersSection — winspool config', () => {
	it('auto-loads on mount and lists only winspool printers', () => {
		const onScan = jest.fn();
		render(
			<OsPrintersSection
				form={makeForm().form}
				printers={winspoolPrinters}
				onScan={onScan}
				{...winspoolProps}
			/>
		);
		expect(onScan).toHaveBeenCalledTimes(1);
		expect(screen.getByText('EPSON TM-T20III')).toBeInTheDocument();
		expect(screen.queryByText('Raw USB')).not.toBeInTheDocument();
	});

	it('selection fills address and name but not connectionType', () => {
		const { form, setValue } = makeForm();
		render(
			<OsPrintersSection
				form={form}
				printers={winspoolPrinters}
				onScan={jest.fn()}
				{...winspoolProps}
			/>
		);
		fireEvent.click(screen.getByTestId('add-printer-installed-device-w1'));
		expect(setValue).toHaveBeenCalledWith('address', 'winspool:EPSON TM-T20III');
		expect(setValue).toHaveBeenCalledWith('name', 'EPSON TM-T20III');
		expect(setValue).not.toHaveBeenCalledWith('connectionType', expect.anything());
	});

	it('shows the empty message when nothing is installed', () => {
		render(
			<OsPrintersSection
				form={makeForm().form}
				printers={[]}
				onScan={jest.fn()}
				{...winspoolProps}
			/>
		);
		expect(screen.getByText('No installed printers found.')).toBeInTheDocument();
	});

	it('shows loading text when scanning and does not show empty message', () => {
		render(
			<OsPrintersSection
				form={makeForm().form}
				printers={[]}
				onScan={jest.fn()}
				scanning={true}
				{...winspoolProps}
			/>
		);
		expect(screen.getByText('Loading installed printers…')).toBeInTheDocument();
		expect(screen.queryByText('No installed printers found.')).not.toBeInTheDocument();
	});
});

describe('OsPrintersSection — serial config', () => {
	it('auto-loads on mount and lists only serial: printers', () => {
		const onScan = jest.fn();
		render(
			<OsPrintersSection
				form={makeForm().form}
				printers={serialPrinters}
				onScan={onScan}
				{...serialProps}
			/>
		);
		expect(onScan).toHaveBeenCalledTimes(1);
		expect(screen.getByText('Star TSP100')).toBeInTheDocument();
		expect(screen.queryByText('BLE Printer')).not.toBeInTheDocument();
	});

	it('uses custom testIdPrefix for serial rows', () => {
		render(
			<OsPrintersSection
				form={makeForm().form}
				printers={serialPrinters}
				onScan={jest.fn()}
				{...serialProps}
			/>
		);
		expect(screen.getByTestId('add-printer-paired-device-s1')).toBeInTheDocument();
		expect(screen.queryByTestId('add-printer-installed-device-s1')).not.toBeInTheDocument();
	});

	it('selection fills address and name but not connectionType', () => {
		const { form, setValue } = makeForm();
		render(
			<OsPrintersSection
				form={form}
				printers={serialPrinters}
				onScan={jest.fn()}
				{...serialProps}
			/>
		);
		fireEvent.click(screen.getByTestId('add-printer-paired-device-s1'));
		expect(setValue).toHaveBeenCalledWith('address', 'serial:/dev/tty.Star-TSP100-SerialPort-1');
		expect(setValue).toHaveBeenCalledWith('name', 'Star TSP100');
		expect(setValue).not.toHaveBeenCalledWith('connectionType', expect.anything());
	});

	it('shows the empty message when no paired printers found', () => {
		render(
			<OsPrintersSection form={makeForm().form} printers={[]} onScan={jest.fn()} {...serialProps} />
		);
		expect(screen.getByText('No paired printers found.')).toBeInTheDocument();
	});

	it('shows loading text when scanning and does not show empty message', () => {
		render(
			<OsPrintersSection
				form={makeForm().form}
				printers={[]}
				onScan={jest.fn()}
				scanning={true}
				{...serialProps}
			/>
		);
		expect(screen.getByText('Loading paired printers…')).toBeInTheDocument();
		expect(screen.queryByText('No paired printers found.')).not.toBeInTheDocument();
	});
});
