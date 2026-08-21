/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useAddVariation } from './use-add-variation';

const mockAddItemToOrder = jest.fn();
const mockCalculateLineItemTaxesAndTotals = jest.fn((lineItem) => lineItem);
const mockConvertVariationToLineItemWithoutTax = jest.fn();
const mockFindByProductVariationID = jest.fn();
const mockGetUuidFromLineItem = jest.fn();
const mockIncrementLineItem = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

type TestOrder = {
	isNew: boolean;
	payload: { id: number; line_items: object[] };
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
	convertVariationToLineItemWithoutTax: (...args: unknown[]) =>
		mockConvertVariationToLineItemWithoutTax(...args),
	findByProductVariationID: (...args: unknown[]) => mockFindByProductVariationID(...args),
	getUuidFromLineItem: (...args: unknown[]) => mockGetUuidFromLineItem(...args),
}));

const variation = { id: 202 };
const parent = { id: 101, name: 'Variable product' };
const variationDocument = {
	remoteId: String(variation.id),
	payload: variation,
	getLatest: () => variationDocument,
};
const parentDocument = {
	remoteId: String(parent.id),
	payload: parent,
	getLatest: () => parentDocument,
};

function makeOrder(id: number, lineItems: object[]): TestOrder {
	return {
		isNew: false,
		payload: { id, line_items: lineItems },
		getLatest: () => ({ payload: { line_items: lineItems } }),
	};
}

describe('useAddVariation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCurrentOrder = makeOrder(1, []);
		mockCalculateLineItemTaxesAndTotals.mockImplementation((lineItem) => lineItem);
		mockConvertVariationToLineItemWithoutTax.mockReturnValue({
			product_id: parent.id,
			variation_id: variation.id,
		});
		mockGetUuidFromLineItem.mockReturnValue('line-item-uuid');
		mockIncrementLineItem.mockResolvedValue(true);
		mockAddItemToOrder.mockResolvedValue(true);
	});

	it('increments a duplicate variation in the current order when a retained callback runs', async () => {
		const duplicateLineItem = { variation_id: variation.id };
		const latestLineItems = [duplicateLineItem];
		const { result } = renderHook(() => useAddVariation());
		const retainedAddVariation = result.current.addVariation;

		mockCurrentOrder = makeOrder(2, latestLineItems);
		mockFindByProductVariationID.mockReturnValue([duplicateLineItem]);

		await act(async () => {
			await retainedAddVariation(variationDocument as never, parentDocument as never);
		});

		expect(mockFindByProductVariationID).toHaveBeenCalledWith(
			latestLineItems,
			parent.id,
			variation.id
		);
		expect(mockIncrementLineItem).toHaveBeenCalledWith('line-item-uuid', 1);
		expect(mockAddItemToOrder).not.toHaveBeenCalled();
	});

	it('adds a new variation to the current order when a retained callback runs', async () => {
		const initialLineItems = [{ variation_id: variation.id }];
		const latestLineItems: object[] = [];
		mockCurrentOrder = makeOrder(1, initialLineItems);
		const { result } = renderHook(() => useAddVariation());
		const retainedAddVariation = result.current.addVariation;

		mockCurrentOrder = makeOrder(2, latestLineItems);
		mockFindByProductVariationID.mockImplementation((lineItems) =>
			lineItems === latestLineItems ? [] : initialLineItems
		);

		await act(async () => {
			await retainedAddVariation(variationDocument as never, parentDocument as never);
		});

		expect(mockFindByProductVariationID).toHaveBeenCalledWith(
			latestLineItems,
			parent.id,
			variation.id
		);
		expect(mockIncrementLineItem).not.toHaveBeenCalled();
		expect(mockAddItemToOrder).toHaveBeenCalledWith('line_items', {
			product_id: parent.id,
			variation_id: variation.id,
		});
	});

	it('reports a falsy add result with the cashier toast', async () => {
		mockFindByProductVariationID.mockReturnValue([]);
		mockAddItemToOrder.mockResolvedValue(undefined);
		const { result } = renderHook(() => useAddVariation());

		await act(async () => {
			await result.current.addVariation(variationDocument as never, parentDocument as never);
		});

		expect(mockLoggerError).toHaveBeenCalledWith('Failed to add product to cart', {
			showToast: true,
			code: 'CART_UPDATE_FAILED',
			toast: { title: 'pos.error_adding_to_cart' },
			context: {
				variationId: 202,
				productId: 101,
				productName: 'Variable product',
				orderId: 1,
			},
		});
	});
});
