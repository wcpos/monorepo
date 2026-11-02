/** @jest-environment jsdom */
import * as React from 'react';

import { render } from '@testing-library/react';

import { BarcodeSettings } from './settings';

const store = { id: 1, barcode_scanning_sound_enabled: false };

jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
jest.mock('react-native', () => ({ View: ({ children }: React.PropsWithChildren) => children }));
jest.mock('react-hook-form', () => ({
	useForm: () => ({ control: {}, getValues: jest.fn() }),
	useWatch: () => false,
}));
jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: jest.fn() }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({
		children,
		role,
		'aria-level': level,
	}: React.PropsWithChildren<{ role?: string; 'aria-level'?: number }>) => (
		<span role={role} aria-level={level}>
			{children}
		</span>
	),
}));
jest.mock('@wcpos/components/button', () => ({ Button: () => null, ButtonText: () => null }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: () => null }));
jest.mock('@wcpos/components/radio-group', () => ({
	RadioGroup: () => null,
	RadioGroupOption: () => null,
}));
jest.mock('@wcpos/components/slider', () => ({ Slider: () => null }));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => children,
	FormField: () => null,
	FormInput: () => null,
	FormSwitch: () => null,
	SavedFieldProvider: ({ children }: React.PropsWithChildren) => children,
	SavedMark: () => null,
	savedKeys: () => [],
	useMarkSaved: () => jest.fn(),
	useFormChangeHandler: jest.fn(),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(document: T, selector: (value: T) => unknown) => selector(document),
}));
jest.mock('@wcpos/query/user-db', () => ({ patchStoreSettings: jest.fn() }));
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({ store }) }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../components/amount-field', () => ({ FormAmountField: () => null }));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../pos/products/play-scan-sound', () => ({
	playScanSuccess: jest.fn(),
	playScanFailure: jest.fn(),
}));

describe('BarcodeSettings', () => {
	it('heads the form with Scanning, then Sound', () => {
		const { getAllByRole } = render(<BarcodeSettings />);

		expect(getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
			'Scanning',
			'Sound',
		]);
	});
});
