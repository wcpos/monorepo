/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { PrinterProfile } from '@wcpos/printer';

import { PrintingSettings } from './index';

// ─── Mutable discovery state ────────────────────────────────────────────────
// Each test resets this before render so we control what usePrinterDiscovery
// returns without re-registering the mock.
let discoveryState = {
	printers: [] as unknown[],
	scanCandidates: [] as string[],
	scanProgress: { tested: 0, total: 0 },
	isScanning: false,
	startScan: jest.fn(),
	stopScan: jest.fn(),
	addManualPrinter: jest.fn(),
	removeDiscoveredPrinter: jest.fn(),
	error: undefined as string | undefined | null,
};

// ─── Module mocks (identical setup to index-cloud.test.tsx) ─────────────────

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

// Collapsible mock — passes testID through so getByTestId works on the trigger
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
	// Return whatever the mutable discoveryState holds at render time
	usePrinterDiscovery: () => discoveryState,
}));

jest.mock('../printer/add-printer', () => ({
	PrinterDialog: () => null,
}));

jest.mock('./printer-row', () => ({
	PrinterRow: ({
		profile,
		onTest,
	}: {
		profile: PrinterProfile;
		onTest: (profile: PrinterProfile) => void;
	}) => (
		<button
			type="button"
			data-testid={`test-printer-${profile.id}`}
			onClick={() => onTest(profile)}
		>
			Test
		</button>
	),
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

jest.mock('../../receipt/hooks/use-active-templates', () => ({
	useActiveTemplates: () => [],
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		storeDB: {
			collections: {
				printer_profiles: {
					// Return an empty printer list so nonBuiltInCount === 0 and we see
					// the PrintersEmptyState path (which is mocked to null), avoiding
					// the printer-rows branch entirely.
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

// Translations: t(key, fallback) returns the fallback string
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

jest.mock('../../hooks/use-cloud-enqueue', () => ({
	createCloudEnqueueFactory: () => () => jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: jest.fn() }),
}));

// ─── Shared candidate list used across both tests ────────────────────────────
const CANDIDATES = ['localhost', '192.168.1.100', '192.168.1.101', '192.168.1.102', '10.0.0.1'];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PrintingSettings scan-candidates box', () => {
	beforeEach(() => {
		// Reset to a safe baseline before each test
		discoveryState = {
			printers: [],
			scanCandidates: CANDIDATES,
			scanProgress: { tested: 0, total: 0 },
			isScanning: false,
			startScan: jest.fn(),
			stopScan: jest.fn(),
			addManualPrinter: jest.fn(),
			removeDiscoveredPrinter: jest.fn(),
			error: null,
		};
	});

	it('shows the progress bar and hides the done toggle while scanning', () => {
		discoveryState = {
			...discoveryState,
			scanCandidates: CANDIDATES,
			scanProgress: { tested: 3, total: 67 },
			isScanning: true,
		};

		render(<PrintingSettings />);

		// The outer scan-candidates VStack is rendered
		expect(screen.getByTestId('printing-scan-candidates')).toBeInTheDocument();

		// Progress bar is present and carries the correct value
		const progressbar = screen.getByRole('progressbar');
		const expectedValue = Math.round((3 / 67) * 100);
		// The component computes (tested/total)*100 without rounding; the mock
		// exposes it directly as aria-valuenow. We allow ±1 for floating point.
		const actual = Number(progressbar.getAttribute('aria-valuenow'));
		expect(actual).toBeGreaterThanOrEqual(expectedValue - 1);
		expect(actual).toBeLessThanOrEqual(expectedValue + 1);

		// The "done" collapsible toggle must NOT be present while scanning
		expect(screen.queryByTestId('printing-scan-candidates-toggle')).toBeNull();
	});

	it('shows the done toggle and hides the progress bar after scanning completes', () => {
		discoveryState = {
			...discoveryState,
			scanCandidates: CANDIDATES,
			scanProgress: { tested: 67, total: 67 },
			isScanning: false,
		};

		render(<PrintingSettings />);

		// The outer scan-candidates VStack is rendered
		expect(screen.getByTestId('printing-scan-candidates')).toBeInTheDocument();

		// The done collapsible trigger is present
		const toggle = screen.getByTestId('printing-scan-candidates-toggle');
		expect(toggle).toBeInTheDocument();

		// The done label should mention the total (67). The translation mock renders
		// the fallback string 'Checked %s common printer addresses' with %s replaced
		// by String(scanProgress.total || scanCandidates.length) = "67"
		expect(toggle.textContent).toContain('67');

		// No progress bar after scan completes
		expect(screen.queryByRole('progressbar')).toBeNull();
	});
});
