/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useAddProduct } from './use-add-product';

const mockAddItemToOrder = jest.fn();
const mockCalculateLineItemTaxesAndTotals = jest.fn((lineItem) => lineItem);
const mockConvertProductToLineItemWithoutTax = jest.fn();
const mockFindByProductVariationID = jest.fn();
const mockGetUuidFromLineItem = jest.fn();
const mockIncrementLineItem = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

type TestOrder = {
	isNew: boolean;
	uuid: string;
	payload: { id: number; number: string; line_items: object[] };
	getLatest: () => { payload: { line_items: object[] } };
};

let mockCurrentOrder: TestOrder;

jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => undefined,
}));

jest.mock('@wcpos/utils/logger', () => {
	const logger = {
		get error() {
			return mockLoggerError;
		},
		get warn() {
			return mockLoggerWarn;
		},
		get info() {
			return mockLoggerInfo;
		},
		get success() {
			return mockLoggerSuccess;
		},
		with: () => logger,
	};
	return {
		getLogger: () => logger,
		getErrorMessage: (error: unknown) => {
			if (error instanceof Error) return error.message;
			return String(error);
		},
	};
});

jest.mock('@wcpos/utils/logger/generated/error-codes.generated', () => ({
	ERROR_CODES: { CART_UPDATE_FAILED: 'CART_UPDATE_FAILED' },
}));

jest.mock('@wcpos/sync-core', () => ({
	MISC_PRODUCT_ID: 0,
	wooIdOf: (remoteId: string) => Number(remoteId),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { metaDataKeys$: {} } }),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrderActions: () => ({
		getCurrentOrderRecord: () => mockCurrentOrder,
		setCurrentOrderID: jest.fn(),
	}),
}));

jest.mock('./use-add-item-to-order', () => ({
	useAddItemToOrder: () => ({ addItemToOrder: mockAddItemToOrder }),
}));

jest.mock('./use-calculate-line-item-tax-and-totals', () => ({
	useCalculateLineItemTaxAndTotals: () => ({
		calculateLineItemTaxesAndTotals: mockCalculateLineItemTaxesAndTotals,
	}),
}));

jest.mock('./use-update-line-item', () => ({
	useUpdateLineItem: () => ({ incrementLineItem: mockIncrementLineItem }),
}));

jest.mock('./utils', () => ({
	convertProductToLineItemWithoutTax: (...args: unknown[]) =>
		mockConvertProductToLineItemWithoutTax(...args),
	findByProductVariationID: (...args: unknown[]) => mockFindByProductVariationID(...args),
	getUuidFromLineItem: (...args: unknown[]) => mockGetUuidFromLineItem(...args),
}));

function makeOrder(id: number, lineItems: object[]): TestOrder {
	return {
		isNew: false,
		uuid: `order-${id}`,
		payload: { id, number: String(id), line_items: lineItems },
		getLatest: () => ({ payload: { line_items: lineItems } }),
	};
}

function engineDocument(payload: Record<string, unknown>, remoteId: string) {
	const document = {
		remoteId,
		payload,
		getLatest: () => document,
	};
	return document;
}

describe('useAddProduct', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCurrentOrder = makeOrder(1, []);
		mockCalculateLineItemTaxesAndTotals.mockImplementation((lineItem) => lineItem);
		mockConvertProductToLineItemWithoutTax.mockReturnValue({ product_id: 101 });
		mockFindByProductVariationID.mockReturnValue(null);
		mockAddItemToOrder.mockResolvedValue(true);
	});

	it('adds an ordinary product document to the order', async () => {
		const { result } = renderHook(() => useAddProduct());

		let added: boolean | undefined;
		await act(async () => {
			added = await result.current.addProduct(
				engineDocument({ id: 101, name: 'Plain product', type: 'simple' }, '101') as never
			);
		});

		expect(added).toBe(true);
		expect(mockAddItemToOrder).toHaveBeenCalledWith('line_items', { product_id: 101 });
	});

	it('refuses a misfiled variation-typed products document instead of writing a malformed line', async () => {
		// A products-collection document with type 'variation' is misfiled (the
		// pre-fix search lane persisted Woo's variation-typed sku-leg rows; a
		// document made dirty before the scope-open purge survives it). Building a
		// product line from it would push product_id = the variation's woo id with
		// no variation_id and no attributes.
		const { result } = renderHook(() => useAddProduct());

		let added: boolean | undefined;
		await act(async () => {
			added = await result.current.addProduct(
				engineDocument(
					{ id: 68023, name: 'Troy Yoga Short - 32, Green', type: 'variation' },
					'68023'
				) as never
			);
		});

		expect(added).toBe(false);
		expect(mockAddItemToOrder).not.toHaveBeenCalled();
		expect(mockConvertProductToLineItemWithoutTax).not.toHaveBeenCalled();
		expect(mockLoggerError).toHaveBeenCalledWith(
			'Refused to add a misfiled variation document as a product',
			expect.objectContaining({
				showToast: true,
				context: expect.objectContaining({ productId: 68023 }),
			})
		);
	});
});
