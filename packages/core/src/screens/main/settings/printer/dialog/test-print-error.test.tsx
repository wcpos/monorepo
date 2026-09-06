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

jest.mock('@wcpos/components/docs-link', () => {
	const React = require('react');
	return {
		DocsLink: ({ children, href, testID }: { children: string; href: string; testID?: string }) =>
			React.createElement('a', { 'data-testid': testID, href }, children),
	};
});
jest.mock('../../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../../jest/translate')>(
				'../../../../../../jest/translate'
			)
			.createTestT(),
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

	it('shows one actionable line instead of the attempt, reason and numbered suggestions', () => {
		render(<TestPrintError error={failureWithDiagnostics} />);

		expect(screen.getByTestId('add-printer-test-error-line')).toHaveTextContent(
			'The printer did not accept the job.'
		);
		expect(screen.queryByText('We tried')).not.toBeInTheDocument();
		expect(screen.queryByText('Likely reason')).not.toBeInTheDocument();
		expect(screen.queryByText(/1\. If this is a local virtual printer/)).not.toBeInTheDocument();
		expect(screen.queryByText(failureWithDiagnostics.message)).not.toBeInTheDocument();
	});

	it('maps a known transport failure to its line', () => {
		render(<TestPrintError error={{ message: 'connect ECONNREFUSED', diagnostics: null }} />);

		expect(screen.getByTestId('add-printer-test-error-line')).toHaveTextContent(
			'The printer refused the connection. Check its network settings, then try again.'
		);
	});

	it('keeps the raw message in the support details', () => {
		render(<TestPrintError error={failureWithDiagnostics} />);

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
});

describe('TestPrintError help entry', () => {
	it('offers "Having trouble?" and opens the printer guide', () => {
		render(<TestPrintError error={{ message: 'Printer did not answer', diagnostics: null }} />);
		expect(screen.getByTestId('add-printer-having-trouble').getAttribute('href')).toBe(
			'https://docs.wcpos.com/hardware/printers'
		);
	});

	it('drops the guide where the screen already offers one', () => {
		render(
			<TestPrintError error={{ message: 'Printer did not answer', diagnostics: null }} hideGuide />
		);
		expect(screen.queryByTestId('add-printer-having-trouble')).not.toBeInTheDocument();
	});
});
