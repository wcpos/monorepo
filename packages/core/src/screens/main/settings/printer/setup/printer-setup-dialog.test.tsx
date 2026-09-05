import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PrinterSetupDialog } from './printer-setup-dialog';
import { createTestT } from '../../../../../../jest/translate';

jest.mock('react-native', () => ({ ActivityIndicator: 'Spinner' }));
jest.mock('@wcpos/components/button', () => ({ Button: 'Button' }));
jest.mock('@wcpos/components/text', () => ({ Text: 'Text' }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: 'Stack' }));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: 'Dialog',
	DialogBody: 'Body',
	DialogContent: 'Content',
	DialogHeader: 'Header',
	DialogTitle: 'Title',
}));
jest.mock('@wcpos/components/form', () => ({ Form: 'Form', FormField: () => null }));
jest.mock('@wcpos/components/select', () => ({ OptionSelect: 'Select' }));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: 'Collapsible',
	CollapsibleTrigger: 'Trigger',
	CollapsibleContent: () => null,
}));
jest.mock('../components/vendor-select', () => ({ VendorSelect: () => null }));
jest.mock('../dialog/printer-toggle-group', () => ({ PrinterToggleGroup: () => null }));
jest.mock('../dialog/test-print-error', () => ({ TestPrintError: () => null }));
jest.mock('../persist-printer-profile', () => ({ persistPrinterProfile: jest.fn() }));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: {} }),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => createTestT() }));
jest.mock('@wcpos/printer', () => ({
	PrinterService: class {
		async testPrint() {}
		async dispose() {}
	},
	usePrinterDiscovery: () => ({
		printers: [
			{
				id: 'epson',
				name: 'Counter',
				address: '192.168.1.10',
				connectionType: 'network',
				identity: {
					vendor: 'epson',
					columns: 48,
					lane: { port: 443, protocol: 'epos-print' },
					ports: [],
				},
			},
		],
		isScanning: false,
		error: null,
		startScan: async () => {},
		stopScan: jest.fn(),
	}),
	canPrintLane: () => true,
	createIdentifyProbes: () => ({}),
	isPrinterConnectionError: () => false,
}));
it('renders the asking screen with all three answers and the test page footer', async () => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	let renderer!: ReactTestRenderer;
	await act(async () => {
		renderer = create(<PrinterSetupDialog open onOpenChange={jest.fn()} onSave={jest.fn()} />);
	});
	const t = createTestT();
	for (const key of ['setup_ok', 'setup_short', 'setup_nothing']) {
		const button = renderer.root.findByProps({ testID: `printer-setup-${key}` });
		expect(button.props.disabled).toBe(false);
		expect(button.findByType('Text' as React.ElementType).props.children).toBe(
			t(`settings.${key}`)
		);
	}
	expect(renderer.root.findByProps({ testID: 'printer-setup-footer' }).props.children).toBe(
		'Test page 1 · 48 characters per line'
	);
	act(() => renderer.unmount());
});
