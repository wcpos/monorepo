/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { PrinterProfile } from '@wcpos/printer';

import { PrintingSettings } from './index';
import { PrinterRow } from './printer-row';

const cloudProfile: PrinterProfile = {
	id: 'cloud:reg-7',
	name: 'Cloud kitchen',
	connectionType: 'cloud',
	vendor: 'generic',
	port: 9100,
	language: 'esc-pos',
	columns: 42,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: false,
	isBuiltIn: true,
	cloudPrinterId: 'reg-7',
};

const enqueue = jest.fn().mockResolvedValue(undefined);
const httpPost = jest.fn().mockResolvedValue({ data: {} });

jest.mock('react-native', () => ({
	View: ({
		children,
		className,
		testID,
	}: {
		children?: React.ReactNode;
		className?: string;
		testID?: string;
	}) => (
		<div className={className} data-testid={testID}>
			{children}
		</div>
	),
}));

// printer-row.tsx reaches the printer wizard through expo-router's useRouter
// (mini-app host, 0b8e7c2e92); the router has no native module under Jest, so it
// is mocked the way the other screen tests mock it (customers/add.test.tsx).
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('observable-hooks', () => ({
	useObservableState: (value: unknown, fallback: unknown) => value ?? fallback,
}));

jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	CollapsibleTrigger: ({ children }: { children?: React.ReactNode }) => (
		<button type="button">{children}</button>
	),
	CollapsibleContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/progress', () => ({
	Progress: ({ value, className }: { value?: number; className?: string }) => (
		<div role="progressbar" aria-valuenow={value} className={className} />
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

jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuItem: ({
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
	Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ testID }: { testID?: string }) => (
		<button type="button" data-testid={testID}>
			Menu
		</button>
	),
}));

jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: jest.fn() },
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

jest.mock('@wcpos/printer', () => ({
	PrinterService: class {
		constructor(
			private readonly options: {
				cloudEnqueueFactory?: (
					profile: PrinterProfile
				) => (printerId: string, job: { data: Uint8Array; contentType: string }) => Promise<void>;
			} = {}
		) {}

		testPrint(profile: PrinterProfile) {
			const cloudPrinterId = profile.cloudPrinterId;
			const queue = this.options.cloudEnqueueFactory?.(profile);
			if (!cloudPrinterId || !queue) {
				throw new Error('Cloud printing is not configured');
			}
			return queue(cloudPrinterId, {
				data: new Uint8Array([1]),
				contentType: 'application/octet-stream',
			});
		}

		dispose = jest.fn().mockResolvedValue(undefined);
	},
	resolvePrinter: jest.fn(),
	usePrinterDiscovery: () => ({
		printers: [],
		scanCandidates: [],
		scanProgress: { tested: 0, total: 0 },
		startScan: jest.fn(),
		isScanning: false,
		error: undefined,
	}),
}));

jest.mock('../printer/add-printer', () => ({
	PrinterDialog: () => null,
}));

jest.mock('./printers-empty-state', () => ({
	PrintersEmptyState: () => <div data-testid="printers-empty-state" />,
}));

jest.mock('../components/settings-section', () => ({
	SettingsSection: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('./template-row', () => ({
	TemplateRow: () => null,
}));

jest.mock('./use-ensure-system-printer', () => ({
	useEnsureSystemPrinter: jest.fn(),
}));

jest.mock('../printer/use-available-printer-profiles', () => ({
	useAvailablePrinterProfiles: () => mockAvailableProfiles,
}));

jest.mock('../../receipt/hooks/use-active-templates', () => ({
	useActiveTemplates: () => [],
}));

jest.mock('../../../../contexts/app-state', () => {
	const useAppState = () => ({
		storeDB: {
			collections: {
				printer_profiles: {
					find: () => ({ $: [cloudProfile] }),
					findOne: jest.fn(),
				},
				template_printer_overrides: {
					find: () => ({ $: { pipe: () => new Map<string, string>() } }),
				},
			},
		},
	});
	return { useAppState, useStoreSession: useAppState };
});

jest.mock('../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../jest/translate')>(
				'../../../../../jest/translate'
			)
			.createTestT(),
}));

jest.mock('../../hooks/use-cloud-enqueue', () => ({
	createCloudEnqueueFactory: () => () => enqueue,
}));

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: httpPost }),
}));

let mockAvailableProfiles = { printers: [cloudProfile], isLoading: false };
jest.mock('@wcpos/components/docs-link', () => {
	const React = require('react');
	return {
		DocsLink: ({ children, href, testID }: { children: string; href: string; testID?: string }) =>
			React.createElement('a', { 'data-testid': testID, href }, children),
	};
});

describe('PrintingSettings cloud printers', () => {
	beforeEach(() => {
		mockAvailableProfiles = { printers: [cloudProfile], isLoading: false };
		enqueue.mockClear();
		httpPost.mockClear();
	});

	it('uses the server diagnostic endpoint when testing a cloud printer', async () => {
		render(<PrintingSettings />);

		fireEvent.click(screen.getByTestId('printer-row-cloud:reg-7-test'));

		await waitFor(() =>
			expect(httpPost).toHaveBeenCalledWith('/print-jobs/test', {
				printer_id: 'reg-7',
			})
		);
		expect(enqueue).not.toHaveBeenCalled();
	});

	it('does not offer a local default action for synthesized cloud printers', () => {
		render(<PrintingSettings />);

		expect(screen.queryByTestId('printer-row-cloud:reg-7-set-default')).not.toBeInTheDocument();
	});

	it('does not render network scan controls on the Printing settings screen', () => {
		render(<PrintingSettings />);

		expect(screen.queryByTestId('printing-scan-network-button')).not.toBeInTheDocument();
		expect(screen.queryByTestId('printing-scan-candidates')).not.toBeInTheDocument();
	});
});

it('hides the list until loaded, then shows the empty state', () => {
	mockAvailableProfiles = { printers: [], isLoading: true };
	const { rerender } = render(<PrintingSettings />);
	expect(screen.queryByTestId('printers-empty-state')).not.toBeInTheDocument();
	expect(screen.queryByTestId('printing-add-printer-button')).not.toBeInTheDocument();
	mockAvailableProfiles = { printers: [], isLoading: false };
	rerender(<PrintingSettings />);
	expect(screen.getByTestId('printers-empty-state')).toBeInTheDocument();
});

it('renders help once outside saved rows and opens the printer guide', () => {
	mockAvailableProfiles = {
		printers: [cloudProfile, { ...cloudProfile, id: 'second' }],
		isLoading: false,
	};
	render(<PrintingSettings />);
	expect(screen.getAllByText('Having trouble?')).toHaveLength(1);
	expect(screen.getByTestId('printing-having-trouble').getAttribute('href')).toBe(
		'https://docs.wcpos.com/hardware/printers'
	);
	expect(
		within(screen.getByTestId('printer-row-second')).queryByText('Having trouble?')
	).toBeNull();
});

it('does not render help on a saved local printer row', () => {
	render(
		<PrinterRow
			profile={{ ...cloudProfile, isBuiltIn: false }}
			isTesting={false}
			onTest={jest.fn()}
			onEdit={jest.fn()}
			onDelete={jest.fn()}
			onSetDefault={jest.fn()}
		/>
	);
	expect(screen.queryByText('Having trouble?')).toBeNull();
});
