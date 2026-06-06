/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { DiscoveredPrinter } from '@wcpos/printer';

import { NetworkFields } from './network-fields';

jest.mock('react-native', () => ({
	View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

jest.mock('@wcpos/components/form', () => ({
	FormField: ({
		render,
		name,
	}: {
		render: (props: { field: Record<string, unknown> }) => React.ReactNode;
		name: string;
	}) => render({ field: { name, value: '' } }),
	FormInput: ({ label, testID }: { label?: string; testID?: string }) => (
		<label>
			{label}
			<input data-testid={testID} />
		</label>
	),
}));

jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({
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
}));

jest.mock('@wcpos/components/icon', () => ({
	Icon: () => null,
}));

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

const makeForm = () =>
	({
		control: {},
		setValue: jest.fn(),
	}) as unknown as React.ComponentProps<typeof NetworkFields>['form'];

const networkPrinter: DiscoveredPrinter = {
	id: 'net-1',
	name: 'Kitchen Epson',
	connectionType: 'network',
	address: '192.168.1.50',
	port: 8043,
	vendor: 'epson',
};

describe('NetworkFields discovery states', () => {
	it('renders searching and empty states inside the Network section', () => {
		const { rerender } = render(
			<NetworkFields
				form={makeForm()}
				probing={false}
				detectedVendor={null}
				onScan={jest.fn()}
				scanning
			/>
		);

		expect(screen.getByTestId('add-printer-network-searching')).toHaveTextContent(
			'Searching for printers...'
		);

		rerender(
			<NetworkFields
				form={makeForm()}
				probing={false}
				detectedVendor={null}
				onScan={jest.fn()}
				scanning={false}
			/>
		);

		expect(screen.getByTestId('add-printer-network-none-found')).toHaveTextContent(
			'No printers found'
		);
	});

	it('renders network scan results as a pick-list and applies the selected target', () => {
		const form = makeForm();
		render(
			<NetworkFields
				form={form}
				probing={false}
				detectedVendor={null}
				onScan={jest.fn()}
				printers={[networkPrinter]}
			/>
		);

		fireEvent.click(screen.getByTestId('add-printer-network-result-net-1'));

		expect(form.setValue).toHaveBeenCalledWith('connectionType', 'network');
		expect(form.setValue).toHaveBeenCalledWith('address', '192.168.1.50', {
			shouldValidate: true,
		});
		expect(form.setValue).toHaveBeenCalledWith('name', 'Kitchen Epson');
		expect(form.setValue).toHaveBeenCalledWith('port', 8043);
		expect(form.setValue).toHaveBeenCalledWith('vendor', 'epson');
	});
});
