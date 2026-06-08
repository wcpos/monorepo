/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { PrinterProfile } from '@wcpos/printer';

import { PrintingSettings } from './index';

const systemProfile: PrinterProfile = {
	id: 'system',
	name: 'Print Dialog',
	connectionType: 'system',
	vendor: 'generic',
	port: 9100,
	language: 'esc-pos',
	columns: 42,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: true,
	isBuiltIn: true,
};

let discoveryState = {
	printers: [] as unknown[],
	scanCandidates: [] as string[],
	scanProgress: { tested: 0, total: 0 },
	isScanning: false,
	startScan: jest.fn(),
	stopScan: jest.fn(),
	addManualPrinter: jest.fn(),
	removeDiscoveredPrinter: jest.fn(),
	error: null as string | null,
};

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

jest.mock('observable-hooks', () => ({
	useObservableState: (value: unknown, fallback: unknown) => value ?? fallback,
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

jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span>{name}</span>,
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
		testPrint = jest.fn().mockResolvedValue(undefined);
		dispose = jest.fn().mockResolvedValue(undefined);
	},
	resolvePrinter: jest.fn(),
	usePrinterDiscovery: () => discoveryState,
}));

jest.mock('../printer/add-printer', () => ({
	PrinterDialog: () => null,
}));

jest.mock('./printer-row', () => ({
	PrinterRow: () => null,
}));

jest.mock('./section-header', () => ({
	SectionHeader: () => null,
}));

jest.mock('./template-row', () => ({
	TemplateRow: () => null,
}));

jest.mock('./use-ensure-system-printer', () => ({
	useEnsureSystemPrinter: jest.fn(),
}));

jest.mock('../printer/use-available-printer-profiles', () => ({
	useAvailablePrinterProfiles: () => [systemProfile],
}));

jest.mock('../../receipt/hooks/use-active-templates', () => ({
	useActiveTemplates: () => [],
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		storeDB: {
			collections: {
				printer_profiles: {
					find: () => ({ $: [] }),
					findOne: jest.fn(),
				},
				template_printer_overrides: {
					find: () => ({ $: { pipe: () => new Map<string, string>() } }),
				},
			},
		},
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

jest.mock('../../hooks/use-cloud-enqueue', () => ({
	createCloudEnqueueFactory: () => () => jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: jest.fn() }),
}));

const CANDIDATES = ['localhost', '192.168.1.100', '192.168.1.101', '10.0.0.1'];

describe('PrintingSettings web network scan', () => {
	beforeEach(() => {
		discoveryState = {
			printers: [],
			scanCandidates: [],
			scanProgress: { tested: 0, total: 0 },
			isScanning: false,
			startScan: jest.fn(),
			stopScan: jest.fn(),
			addManualPrinter: jest.fn(),
			removeDiscoveredPrinter: jest.fn(),
			error: null,
		};
	});

	it('shows the scan button in the empty printers state and starts discovery', () => {
		render(<PrintingSettings />);

		fireEvent.click(screen.getByTestId('printing-scan-network-button'));

		expect(discoveryState.startScan).toHaveBeenCalledTimes(1);
	});

	it('shows progress while scanning likely web printer addresses', () => {
		discoveryState = {
			...discoveryState,
			scanCandidates: CANDIDATES,
			scanProgress: { tested: 2, total: 4 },
			isScanning: true,
		};

		render(<PrintingSettings />);

		expect(screen.getByTestId('printing-scan-candidates')).toBeInTheDocument();
		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
		expect(screen.queryByTestId('printing-scan-candidates-toggle')).not.toBeInTheDocument();
	});

	it('shows the checked ip addresses after scanning completes', () => {
		discoveryState = {
			...discoveryState,
			scanCandidates: CANDIDATES,
			scanProgress: { tested: 4, total: 4 },
			isScanning: false,
		};

		render(<PrintingSettings />);

		expect(screen.getByTestId('printing-scan-candidates-toggle')).toHaveTextContent('4');
		expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
		expect(screen.getByText(CANDIDATES.join(', '))).toBeInTheDocument();
	});
});
