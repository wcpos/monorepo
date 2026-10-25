/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { EditProductForm } from './form';
import { EditVariationForm } from '../variation/form';

const mockLocalPatch = jest.fn();
const mockMarkSaved = jest.fn();
const mockFlush = jest.fn(async () => true);
let capturedChange: (changes: Record<string, unknown>) => boolean | Promise<boolean>;

const formValues: Record<string, unknown> = {
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
	getValues: jest.fn((name?: string) => (name ? formValues[name] : formValues)),
	reset: jest.fn(),
};
const mockUseForm = jest.fn((_options: unknown) => form);

jest.mock('react-hook-form', () => ({
	useForm: (options: unknown) => mockUseForm(options),
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
	FormItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormLabel: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SavedFieldProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SavedMark: ({ name }: { name: string }) => <div data-testid={`saved-${name}`} />,
	useMarkSaved: () => mockMarkSaved,
	useFormChangeHandler: (options: { onChange: typeof capturedChange }) => {
		capturedChange = options.onChange;
		return { flush: mockFlush };
	},
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
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({
		destructive,
		record,
		close,
	}: import('@wcpos/components/dialog').DialogFooterProps) => (
		<>
			{[destructive, record, typeof close === 'object' ? { ...close, label: 'Close' } : undefined]
				.flat()
				.filter(Boolean)
				.map((action) => (
					<button key={action!.testID} data-testid={action!.testID}>
						{action!.label}
					</button>
				))}
		</>
	),
	useDialog: () => ({ close: jest.fn() }),
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
jest.mock('../../../hooks/mutations/use-mutation', () => ({
	useMutation: () => ({ patchRecord: jest.fn() }),
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

let mockIsPro = true;
let mockOnSynced: (() => void) | undefined;
let mockBeforeSync: (() => Promise<boolean>) | undefined;
type ActionCallbacks = { onSynced?: () => void; beforeSync?: () => Promise<boolean> };
jest.mock('../../../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: mockIsPro } }),
}));
// The record actions are `product-actions.test.tsx`'s; here only their place in the footer.
jest.mock('../../product-actions', () => {
	const actions = (callbacks: ActionCallbacks) => {
		mockOnSynced = callbacks.onSynced;
		mockBeforeSync = callbacks.beforeSync;
		return { canDelete: true, canSync: true, deleteOpen: false };
	};
	return {
		useProductActions: (_record: unknown, callbacks: ActionCallbacks) => actions(callbacks),
		useVariationActions: (_record: unknown, callbacks: ActionCallbacks) => actions(callbacks),
		DeleteProductDialog: () => null,
		DeleteVariationDialog: () => null,
	};
});

const productData = {
	id: 5,
	name: 'Test product',
	categories: [],
	meta_data: [] as { id?: number; key?: string; value?: unknown }[],
};
const product = {
	uuid: 'product-5',
	payload: productData,
	toMutableJSON: () => ({ payload: productData }),
	getLatest: () => product,
	collection: { name: 'products' },
} as unknown as EngineRecord<'products'>;

/** Field edits write only their root and acknowledge only a successful local patch. */
describe('catalogue form autosave', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLocalPatch.mockResolvedValue({ changes: {}, document: product });
		formValues.name = 'Test product';
		formValues.meta_data = [];
		productData.meta_data = [];
		mockBeforeSync = undefined;
		mockIsPro = true;
	});

	it('reports a missing product before reading its payload', () => {
		expect(() => render(<EditProductForm product={undefined!} />)).toThrow(
			'products.product_not_found'
		);
	});

	it('reports a missing variation before reading its payload', () => {
		expect(() => render(<EditVariationForm variation={undefined!} />)).toThrow(
			'Variation not found'
		);
	});

	it('reads initial form values from the record payload', () => {
		render(<EditProductForm product={product} />);

		expect(mockUseForm).toHaveBeenCalledWith(
			expect.objectContaining({ defaultValues: expect.objectContaining({ name: 'Test product' }) })
		);
	});

	it('puts the record actions in the footer on Pro only, and Sync resets the form from the store copy', () => {
		const { unmount } = render(<EditProductForm product={product} />);
		expect(screen.getByTestId('product-modal-delete')).toBeTruthy();
		mockOnSynced!();
		expect(form.reset).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test product' }));
		unmount();
		mockIsPro = false;
		render(<EditProductForm product={product} />);
		expect(screen.queryByTestId('product-modal-delete')).toBeNull();
	});

	it('a name edit writes only the name and marks it saved', async () => {
		formValues.name = 'Renamed';
		render(<EditProductForm product={product} />);

		await expect(capturedChange({ name: 'Renamed' })).resolves.toBe(true);

		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).toHaveBeenCalledWith({ document: product, data: { name: 'Renamed' } });
		expect(mockMarkSaved).toHaveBeenCalledWith(['name']);
	});

	it('categories write id and name rows rather than form options', async () => {
		render(<EditProductForm product={product} />);

		await capturedChange({ categories: formValues.categories });

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: product,
			data: { categories: [{ id: 7, name: 'Category 7' }] },
		});
	});

	describe.each(['product', 'variation'] as const)('%s', (kind) => {
		const renderForm = () =>
			render(
				kind === 'product' ? (
					<EditProductForm product={product} />
				) : (
					<EditVariationForm variation={product as unknown as EngineRecord<'variations'>} />
				)
			);

		it('renders a Saved mark for every writable field root', () => {
			renderForm();

			const fields = [
				'sku',
				'barcode',
				'regular_price',
				'sale_price',
				'status',
				'stock_quantity',
				'manage_stock',
				'tax_class',
				'tax_status',
				'meta_data',
				...(kind === 'product'
					? ['name', 'categories', 'featured', 'virtual', 'downloadable']
					: []),
			];
			for (const name of fields) {
				expect(screen.getByTestId(`saved-${name}`)).toBeTruthy();
			}
		});

		it('tax_class leaves as the wire spelling', async () => {
			renderForm();

			await capturedChange({ tax_class: 'standard' });

			expect(mockLocalPatch).toHaveBeenCalledWith({ document: product, data: { tax_class: '' } });
		});

		it('a nested meta path writes the root without a just-added blank row', async () => {
			formValues.meta_data = [
				{ id: 3, key: 'a', value: 'b' },
				{ key: '', value: '' },
			];
			renderForm();

			await capturedChange({ 'meta_data.1.key': '' });

			expect(mockLocalPatch).toHaveBeenCalledWith({
				document: product,
				data: { meta_data: [{ id: 3, key: 'a', value: 'b' }] },
			});
		});

		it('tombstones a removed row after the store numbers an earlier meta write', async () => {
			formValues.meta_data = [{ key: 'colour', value: 'red' }];
			renderForm();
			await capturedChange({ 'meta_data.0.value': 'red' });
			productData.meta_data = [{ id: 9, key: 'colour', value: 'red' }];
			formValues.meta_data = [];
			await capturedChange({ meta_data: [] });
			expect(mockLocalPatch).toHaveBeenCalledTimes(2);
			expect(mockLocalPatch.mock.calls[1][0].data.meta_data).toEqual([
				{ id: 9, key: 'colour', value: null },
			]);
		});

		it('a failed write returns false with no mark', async () => {
			mockLocalPatch.mockResolvedValue(undefined);
			renderForm();

			await expect(capturedChange({ tax_class: 'standard' })).resolves.toBe(false);

			expect(mockMarkSaved).not.toHaveBeenCalled();
		});

		it('the read-only form refuses the write and marks nothing', async () => {
			mockIsPro = false;
			renderForm();

			expect(await capturedChange({ name: 'x' })).toBe(false);

			expect(mockLocalPatch).not.toHaveBeenCalled();
			expect(mockMarkSaved).not.toHaveBeenCalled();
		});

		it('gives Sync the autosave flush', () => {
			renderForm();
			expect(mockBeforeSync).toBe(mockFlush);
		});
	});
});
