/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { UISettingsForm } from './ui-settings-form';

let mockFormData = { columns: [{ key: 'before', show: true }] };
let mockResetHandler: (() => void) | null = null;
const mockUISettings = { get: () => mockFormData };

jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: { children: React.ReactNode }) => children,
	useFormChangeHandler: jest.fn(),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (
		document: typeof mockUISettings,
		selector: (value: typeof mockFormData) => unknown
	) => selector(document.get()),
}));
jest.mock('../components/ui-settings', () => ({
	columnsFormSchema: { shape: {} },
	UISettingsColumnsForm: ({ columns }: { columns: typeof mockFormData.columns }) => (
		<div data-testid="columns">{columns.map(({ key }) => key).join(',')}</div>
	),
	useDialogContext: () => ({
		setButtonPressHandler: (handler: () => void) => {
			mockResetHandler = handler;
		},
	}),
}));
jest.mock('../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: mockUISettings,
		getUILabel: (key: string) => key,
		patchUI: jest.fn(),
		resetUI: async () => {
			mockFormData = { columns: [{ key: 'after', show: true }] };
		},
	}),
}));

it('renders reset column structure from the reactive settings document', async () => {
	mockFormData = { columns: [{ key: 'before', show: true }] };
	mockResetHandler = null;
	const view = render(<UISettingsForm />);

	expect(screen.getByTestId('columns').textContent).toBe('before');
	await act(async () => mockResetHandler?.());
	view.rerender(<UISettingsForm />);

	expect(screen.getByTestId('columns').textContent).toBe('after');
});
