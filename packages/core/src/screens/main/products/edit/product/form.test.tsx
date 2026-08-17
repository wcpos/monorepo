/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { EditProductForm } from './form';

const mockLocalPatch = jest.fn();
const mockModalClose = jest.fn();
const modalActions = new Map<string, { onPress?: () => unknown; disabled: boolean }>();

const formValues = {
	name: 'Test product',
	categories: [{ value: '7', label: 'Category 7' }],
	regular_price: '10',
	sale_price: '',
	status: 'publish',
	featured: false,
	virtual: false,
	downloadable: false,
	tax_status: 'taxable',
	tax_class: 'standard',
	meta_data: [],
};

const form = {
	control: {},
	handleSubmit: jest.fn(
		(callback: (data: typeof formValues) => unknown) => () =>
			callback({ ...formValues, categories: [...formValues.categories] })
	),
};

jest.mock('react-hook-form', () => ({
	useForm: () => form,
}));

jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormField: ({
		name,
		render: renderField,
	}: {
		name: string;
		render: (input: { field: Record<string, unknown> }) => React.ReactNode;
	}) => renderField({ field: { name, value: '', onChange: jest.fn() } }),
	FormInput: () => null,
	FormRadioGroup: () => null,
	FormSelect: () => null,
	FormSwitch: () => null,
	FormTreeCombobox: () => null,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/modal', () => ({
	ModalAction: ({
		children,
		onPress,
		disabled,
		testID,
	}: React.PropsWithChildren<{
		onPress?: () => unknown;
		disabled?: boolean;
		testID?: string;
	}>) => {
		if (testID) {
			modalActions.set(testID, { onPress, disabled: !!disabled });
		}
		return <>{children}</>;
	},
	ModalClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
	useModal: () => ({ close: mockModalClose }),
}));

jest.mock('../../../components/currency-input', () => ({ CurrencyInput: () => null }));
jest.mock('../../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../../components/meta-data-form', () => ({
	MetaDataForm: () => null,
	metaDataSchema: {},
}));
jest.mock('../../../components/number-input', () => ({ NumberInput: () => null }));
jest.mock('../../../components/product/status-select', () => ({
	ProductStatusSelect: () => null,
}));
jest.mock('../../../components/tax-class-select', () => ({ TaxClassSelect: () => null }));
jest.mock('../../../components/tax-status-radio-group', () => ({
	TaxStatusRadioGroup: () => null,
}));
jest.mock('../../../components/product/category-select', () => ({
	CategoryTreeLoader: () => null,
}));

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

const product = {
	id: 5,
	name: 'Test product',
	categories: [],
	meta_data: [],
} as unknown as import('@wcpos/database').ProductDocument;

/**
 * The edit modal must dismiss itself after a successful save, but a failed
 * save has to keep the form on screen so the cashier can correct and retry.
 */
describe('EditProductForm save', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		modalActions.clear();
	});

	it('closes the modal after a successful save', async () => {
		mockLocalPatch.mockResolvedValue({ changes: {}, document: product });
		render(<EditProductForm product={product} />);

		await act(async () => {
			await modalActions.get('product-edit-save-button')!.onPress!();
		});

		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockModalClose).toHaveBeenCalledTimes(1);
	});

	it('keeps the modal open when the local patch fails', async () => {
		// localPatch swallows write errors and resolves undefined
		mockLocalPatch.mockResolvedValue(undefined);
		render(<EditProductForm product={product} />);

		await act(async () => {
			await modalActions.get('product-edit-save-button')!.onPress!();
		});

		expect(mockModalClose).not.toHaveBeenCalled();
	});
});
