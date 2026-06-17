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

jest.mock('@wcpos/components/collapsible', () => {
	const React = require('react') as typeof import('react');
	const Context = React.createContext<{
		open: boolean;
		setOpen: React.Dispatch<React.SetStateAction<boolean>>;
	} | null>(null);

	return {
		Collapsible: ({ children }: { children?: React.ReactNode }) => {
			const [open, setOpen] = React.useState(false);
			return <Context.Provider value={{ open, setOpen }}>{children}</Context.Provider>;
		},
		CollapsibleTrigger: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => {
			const context = React.useContext(Context);
			return (
				<button type="button" data-testid={testID} onClick={() => context?.setOpen((v) => !v)}>
					{children}
				</button>
			);
		},
		CollapsibleContent: ({ children }: { children?: React.ReactNode }) => {
			const context = React.useContext(Context);
			return context?.open ? <div>{children}</div> : null;
		},
	};
});

jest.mock('@wcpos/components/progress', () => ({
	Progress: ({ value, className }: { value?: number; className?: string }) => (
		<div role="progressbar" aria-valuenow={value} className={className} />
	),
}));

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

const makeForm = () =>
	({
		control: {},
		setValue: jest.fn(),
		resetField: jest.fn(),
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
			'Enter the IP address above to add one manually'
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
		expect(form.setValue).toHaveBeenCalledWith('port', 8043, { shouldValidate: true });
		expect(form.setValue).toHaveBeenCalledWith('vendor', 'epson');
		expect((form.setValue as jest.Mock).mock.calls).toEqual([
			['connectionType', 'network'],
			['address', '192.168.1.50', { shouldValidate: true }],
			['name', 'Kitchen Epson'],
			['vendor', 'epson'],
			['port', 8043, { shouldValidate: true }],
		]);
	});

	it('labels scan results with a clear call to action', () => {
		render(
			<NetworkFields
				form={makeForm()}
				probing={false}
				detectedVendor={null}
				onScan={jest.fn()}
				printers={[networkPrinter]}
			/>
		);

		expect(screen.getByText('Use this printer')).toBeInTheDocument();
		expect(screen.getByText('Discovered: 192.168.1.50:8043')).toBeInTheDocument();
	});

	// Regression: a printer discovered at localhost:9100 used to populate the
	// Port field with 9100 while the actual request went to the web endpoint.
	it('normalizes a raw-TCP scan result through resolveResultPort and shows the web endpoint', () => {
		const form = makeForm();
		const rawTcpPrinter: DiscoveredPrinter = {
			id: 'localhost:9100',
			name: 'Epson printer (localhost)',
			connectionType: 'network',
			address: 'localhost',
			port: 9100,
			vendor: 'epson',
		};
		render(
			<NetworkFields
				form={form}
				probing={false}
				detectedVendor={null}
				onScan={jest.fn()}
				printers={[rawTcpPrinter]}
				resolveResultPort={() => 8008}
				resultEndpoint={() => 'http://localhost:8008/cgi-bin/epos/service.cgi'}
			/>
		);

		expect(
			screen.getByTestId('add-printer-network-result-endpoint-localhost:9100')
		).toHaveTextContent('Web printing will use: http://localhost:8008/cgi-bin/epos/service.cgi');
		expect(
			screen.getByTestId('add-printer-network-result-raw-tcp-localhost:9100')
		).toHaveTextContent('Browsers cannot print to raw TCP port 9100');

		fireEvent.click(screen.getByTestId('add-printer-network-result-localhost:9100'));

		expect(form.setValue).toHaveBeenCalledWith('port', 8008, { shouldValidate: true });
		expect(form.setValue).not.toHaveBeenCalledWith('port', 9100, expect.anything());
	});

	it('shows a labeled web print endpoint preview with an explanation', () => {
		render(
			<NetworkFields
				form={makeForm()}
				probing={false}
				detectedVendor={null}
				endpointHint="https://localhost:8043/cgi-bin/epos/service.cgi"
				endpointExplanation="Using Epson ePOS over HTTPS because this page is secure and port 8043 is selected."
			/>
		);

		expect(screen.getByText('Web print endpoint')).toBeInTheDocument();
		expect(screen.getByTestId('add-printer-endpoint-hint')).toHaveTextContent(
			'https://localhost:8043/cgi-bin/epos/service.cgi'
		);
		expect(screen.getByTestId('add-printer-endpoint-explanation')).toHaveTextContent(
			'Using Epson ePOS over HTTPS'
		);
	});

	it('clears stale port state when the selected target has no port', () => {
		const form = makeForm();
		render(
			<NetworkFields
				form={form}
				probing={false}
				detectedVendor={null}
				onScan={jest.fn()}
				printers={[{ ...networkPrinter, id: 'net-2', port: undefined }]}
			/>
		);

		fireEvent.click(screen.getByTestId('add-printer-network-result-net-2'));

		expect(form.resetField).toHaveBeenCalledWith('port');
	});

	it('shows progress and checked addresses for the web likely-address scan', () => {
		const { rerender } = render(
			<NetworkFields
				form={makeForm()}
				probing={false}
				detectedVendor={null}
				onScan={jest.fn()}
				scanning
				scanCandidates={['192.168.1.50', '192.168.1.51']}
				scanProgress={{ tested: 1, total: 2 }}
			/>
		);

		expect(screen.getByText('Checking common printer addresses… 1 / 2')).toBeInTheDocument();
		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
		expect(
			screen.getByText('If your printer shows a different IP address, add it manually.')
		).toBeInTheDocument();

		rerender(
			<NetworkFields
				form={makeForm()}
				probing={false}
				detectedVendor={null}
				onScan={jest.fn()}
				scanning={false}
				scanCandidates={['192.168.1.50', '192.168.1.51']}
				scanProgress={{ tested: 2, total: 2 }}
			/>
		);

		const toggle = screen.getByTestId('add-printer-scan-candidates-toggle');
		expect(toggle).toHaveTextContent('Checked 2 common printer addresses');
		expect(screen.queryByText('192.168.1.50, 192.168.1.51')).not.toBeInTheDocument();

		fireEvent.click(toggle);

		expect(screen.getByText('192.168.1.50, 192.168.1.51')).toBeInTheDocument();
	});
});
