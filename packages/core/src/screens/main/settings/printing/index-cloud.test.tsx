/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { PrinterProfile } from '@wcpos/printer';

import { PrintingSettings } from './index';

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
	PrintersEmptyState: () => null,
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
	useAvailablePrinterProfiles: () => [cloudProfile],
}));

jest.mock('../../receipt/hooks/use-active-templates', () => ({
	useActiveTemplates: () => [],
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
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
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

jest.mock('../../hooks/use-cloud-enqueue', () => ({
	createCloudEnqueueFactory: () => () => enqueue,
}));

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: jest.fn() }),
}));

describe('PrintingSettings cloud printers', () => {
	beforeEach(() => {
		enqueue.mockClear();
	});

	it('uses the cloud enqueue factory when testing a saved cloud printer', async () => {
		render(<PrintingSettings />);

		fireEvent.click(screen.getByTestId('printer-row-cloud:reg-7-test'));

		await waitFor(() =>
			expect(enqueue).toHaveBeenCalledWith(
				'reg-7',
				expect.objectContaining({ contentType: 'application/octet-stream' })
			)
		);
	});

	it('does not offer a local default action for synthesized cloud printers', () => {
		render(<PrintingSettings />);

		expect(screen.queryByTestId('printer-row-cloud:reg-7-set-default')).not.toBeInTheDocument();
	});
});
