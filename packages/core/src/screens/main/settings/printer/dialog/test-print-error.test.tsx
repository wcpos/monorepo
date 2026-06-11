/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { TestPrintError } from './test-print-error';

import type { TestPrintFailure } from './use-printer-dialog-form';

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
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

jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: jest.fn() },
}));

jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	CollapsibleTrigger: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<button type="button" data-testid={testID}>
			{children}
		</button>
	),
	CollapsibleContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

const failureWithDiagnostics: TestPrintFailure = {
	message: 'Could not connect to Epson printer at https://localhost:8043/cgi-bin/epos/service.cgi.',
	diagnostics: {
		vendorLabel: 'Epson',
		attemptLabel: 'Epson ePOS over HTTPS',
		url: 'https://localhost:8043/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000',
		host: 'localhost',
		port: 8043,
		scheme: 'https',
		likelyReason: "The printer did not respond on Epson's HTTPS ePOS port.",
		suggestions: [
			'If this is a local virtual printer, it speaks plain HTTP — set the port to 8008.',
			"If this is a real Epson printer, ensure ePOS is enabled in the printer's network settings.",
		],
		errorDetail: 'TypeError: Failed to fetch',
	},
};

describe('TestPrintError', () => {
	it('renders nothing without an error', () => {
		const { container } = render(<TestPrintError error={null} />);
		expect(container).toBeEmptyDOMElement();
	});

	it('renders the structured attempt, reason, suggestions, and support details', () => {
		render(<TestPrintError error={failureWithDiagnostics} />);

		expect(screen.getByText('Could not connect to the printer.')).toBeInTheDocument();
		expect(screen.getByText('Epson ePOS over HTTPS')).toBeInTheDocument();
		expect(screen.getByTestId('add-printer-test-error-url')).toHaveTextContent(
			'https://localhost:8043/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000'
		);
		expect(
			screen.getByText("The printer did not respond on Epson's HTTPS ePOS port.")
		).toBeInTheDocument();
		expect(screen.getByText(/1\. If this is a local virtual printer/)).toBeInTheDocument();

		const details = screen.getByTestId('add-printer-support-details');
		expect(details).toHaveTextContent('Vendor: Epson');
		expect(details).toHaveTextContent('Host: localhost');
		expect(details).toHaveTextContent('Configured port: 8043');
		expect(details).toHaveTextContent('Platform: web');
		expect(details).toHaveTextContent('Error: TypeError: Failed to fetch');
	});

	it('copies support details to the clipboard', async () => {
		const writeText = jest.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });

		render(<TestPrintError error={failureWithDiagnostics} />);
		fireEvent.click(screen.getByTestId('add-printer-copy-support-details'));

		expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Vendor: Epson'));
		expect(writeText).toHaveBeenCalledWith(
			expect.stringContaining('Endpoint: https://localhost:8043')
		);
	});

	it('falls back to the plain message without diagnostics', () => {
		render(<TestPrintError error={{ message: 'Printer exploded', diagnostics: null }} />);
		expect(screen.getByText('Printer exploded')).toBeInTheDocument();
		expect(screen.queryByText('We tried:')).not.toBeInTheDocument();
	});
});
