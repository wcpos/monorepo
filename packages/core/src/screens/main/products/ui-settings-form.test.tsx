/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { UISettingsForm } from './ui-settings-form';

let mockFormData = { columns: [{ key: 'before', show: true }] };
let mockResetHandler: (() => void) | null = null;
const mockUISettings = { get: () => mockFormData };

jest.mock('@wcpos/components/form', () => {
	// `Form` is react-hook-form's FormProvider (packages/components/src/form/index.tsx).
	// The columns renderer reaches the field array through that context, so the double
	// has to provide the real thing rather than pass children through.
	const { FormProvider } = require('react-hook-form');
	return { Form: FormProvider, useFormChangeHandler: jest.fn() };
});
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (
		document: typeof mockUISettings,
		selector: (value: typeof mockFormData) => unknown
	) => selector(document.get()),
}));
jest.mock('../components/ui-settings', () => {
	const { useFieldArray, useFormContext } = require('react-hook-form');
	return {
		columnsFormSchema: { shape: {} },
		/**
		 * Mirrors the production renderer's data path: the real UISettingsColumnsForm
		 * takes its rows from useFieldArray('columns') and never reads the `columns`
		 * prop. A double that rendered the prop would pass on stale form state.
		 */
		UISettingsColumnsForm: () => {
			const form = useFormContext();
			const { fields } = useFieldArray({ control: form.control, name: 'columns' });
			return (
				<div data-testid="columns">
					{fields.map((field: { key: string }) => field.key).join(',')}
				</div>
			);
		},
		useDialogContext: () => ({
			setButtonPressHandler: (handler: () => void) => {
				mockResetHandler = handler;
			},
		}),
	};
});
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

beforeEach(() => {
	mockFormData = { columns: [{ key: 'before', show: true }] };
	mockResetHandler = null;
});

/**
 * Guards the removal of the bespoke `handleReset`: the reset button now only calls
 * `resetUI()`, and the rendered rows have to follow from `values` alone. This one
 * also passed under the old snapshot model — `form.reset()` moved the field array
 * too — so it is a non-regression guard, not the pin.
 */
it('updates the rendered columns from the reset button alone', async () => {
	const view = render(<UISettingsForm />);

	expect(screen.getByTestId('columns').textContent).toBe('before');
	await act(async () => mockResetHandler?.());
	view.rerender(<UISettingsForm />);

	expect(screen.getByTestId('columns').textContent).toBe('after');
});

/**
 * The pin. Under the old `useMemo` snapshot this fails with
 * `Expected "elsewhere" / Received "before"`: a settings write that does not come
 * from this form's own reset button never reached the open dialog.
 */
it('follows a settings document change that did not come from the reset button', () => {
	const view = render(<UISettingsForm />);

	expect(screen.getByTestId('columns').textContent).toBe('before');

	// Written by something other than this form — a heal pass, another screen, sync.
	mockFormData = { columns: [{ key: 'elsewhere', show: true }] };
	view.rerender(<UISettingsForm />);

	expect(screen.getByTestId('columns').textContent).toBe('elsewhere');
});
