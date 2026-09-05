/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { PrinterProfile } from '@wcpos/printer';

import { PrinterRow } from './printer-row';

// The real row: a saved printer was tested and saved, so it must not carry the wizard entry.
jest.mock('react-native', () => ({
	View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@wcpos/components/docs-link', () => {
	const React = require('react');
	return {
		DocsLink: ({ children, href, testID }: { children: string; href: string; testID?: string }) =>
			React.createElement('a', { 'data-testid': testID, href }, children),
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<button type="button" data-testid={testID}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('../printer/copy-setup-report', () => ({ useCopySetupReport: () => jest.fn() }));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ testID }: { testID?: string }) => <button type="button" data-testid={testID} />,
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

const profile: PrinterProfile = {
	id: 'p1',
	name: 'TM-m30III',
	connectionType: 'network',
	vendor: 'epson',
	address: '192.168.1.131',
	port: 9100,
} as PrinterProfile;

it('renders a saved printer without the wizard entry, even when the wizard is available', () => {
	render(
		<PrinterRow
			profile={profile}
			isTesting={false}
			onTest={jest.fn()}
			onEdit={jest.fn()}
			onSetDefault={jest.fn()}
			onDelete={jest.fn()}
		/>
	);
	expect(screen.getByText('TM-m30III')).toBeInTheDocument();
	expect(screen.getByTestId('printer-row-p1-test')).toBeInTheDocument();
	expect(screen.queryByText('settings.having_trouble')).toBeNull();
});
