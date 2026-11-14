/** @jest-environment jsdom */
import * as React from 'react';

import { render } from '@testing-library/react';

import { TestPanel } from './test-panel';

const mockInputProps: Record<string, Record<string, unknown>> = {};
const store = { id: 1 };

// Native: the capture field is focused for the scanner's keystrokes.
jest.mock('react-native', () => ({
	Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios },
	ScrollView: ({ children }: React.PropsWithChildren) => children,
	View: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/input', () => ({
	Input: (props: Record<string, unknown>) => {
		mockInputProps[String(props.testID)] = props;
		return null;
	},
}));
jest.mock('@wcpos/components/label', () => ({ Label: () => null }));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/docs-link', () => ({ DocsLink: () => null }));
jest.mock('@wcpos/components/empty-state', () => ({ EmptyState: () => null }));
jest.mock('@wcpos/components/card', () => ({ Card: () => null }));
jest.mock('@wcpos/components/badge', () => ({ Badge: () => null }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: () => null }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/notice', () => ({ Notice: () => null }));
jest.mock('@wcpos/components/text', () => ({ Text: () => null }));
jest.mock('@wcpos/scanner', () => ({ analyzeScanTrace: jest.fn() }));
jest.mock('observable-hooks', () => ({ useObservableState: () => undefined }));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(document: T, selector: (value: T) => unknown) => selector(document),
}));
jest.mock('@wcpos/query/user-db', () => ({ patchStoreSettings: jest.fn() }));
jest.mock('./use-scan-trace-capture', () => ({
	useScanTraceCapture: () => ({ currentKeys: [], attempts: [], onKeyPress: jest.fn() }),
}));
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({ store }) }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../hooks/barcodes', () => ({
	useBarcodeDetection: () => ({ barcode$: undefined, onKeyPress: jest.fn() }),
}));

// Owner, iPad, 2026-11-08: "On native, when I go to the Settings > Barcode Scanner screen, the
// keyboard is activated automatically."
it('on native the capture field takes no focus of its own, so the page opens with no keyboard', () => {
	render(<TestPanel />);
	const field = mockInputProps['barcode-test-keys'];
	expect(field.autoFocus ?? false).toBe(false);
	expect(field.editable).toBe(true);
	expect(field.onKeyPress).toBeInstanceOf(Function);
});
