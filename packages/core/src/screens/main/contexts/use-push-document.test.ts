/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { usePushDocument } from './use-push-document';

const mockPost = jest.fn();
const mockTranslate = jest.fn((_key: string, options?: Record<string, unknown>) =>
	String(options?.error || options?.message || '')
);

jest.mock('../../../contexts/translations', () => ({
	useT: () => mockTranslate,
}));

jest.mock('../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({
		post: mockPost,
	}),
}));

describe('usePushDocument', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('sends line item images to the server unchanged', async () => {
		const image = { id: 77, src: 'https://example.com/local-product.jpg' };
		const json = {
			id: 123,
			line_items: [{ id: 1, product_id: 42, quantity: 1, image }],
		};
		const incrementalPatch = jest.fn(async (data: unknown) => data);
		const latestDoc = {
			id: 123,
			collection: {
				name: 'orders',
				parseRestResponse: jest.fn((data) => data),
			},
			toJSON: () => json,
			incrementalPatch,
		};
		const doc = {
			collection: latestDoc.collection,
			getLatest: () => latestDoc,
			id: 123,
		};

		mockPost.mockResolvedValueOnce({ data: json });

		const { result } = renderHook(() => usePushDocument());

		await act(async () => {
			await result.current(doc as never);
		});

		expect(mockPost).toHaveBeenCalledWith('orders/123', json);
	});

	it('reconciles local line item images with the server-populated response', async () => {
		const sentImage = { id: 77, src: 'https://example.com/local-product.jpg' };
		const serverImage = { id: 88, src: 'https://example.com/server-product.jpg' };
		const json = {
			id: 123,
			line_items: [{ id: 1, product_id: 42, quantity: 1, image: sentImage }],
		};
		const parsedServerData = {
			id: 123,
			line_items: [{ id: 1, product_id: 42, quantity: 1, image: serverImage }],
		};
		const incrementalPatch = jest.fn(async (data: unknown) => data);
		const parseRestResponse = jest.fn(() => parsedServerData);
		const latestDoc = {
			id: 123,
			collection: {
				name: 'orders',
				parseRestResponse,
			},
			toJSON: () => json,
			incrementalPatch,
		};
		const doc = {
			collection: latestDoc.collection,
			getLatest: () => latestDoc,
			id: 123,
		};

		mockPost.mockResolvedValueOnce({ data: parsedServerData });

		const { result } = renderHook(() => usePushDocument());

		await act(async () => {
			await result.current(doc as never);
		});

		expect(parseRestResponse).toHaveBeenCalledWith(parsedServerData);
		expect(incrementalPatch).toHaveBeenCalledWith(parsedServerData);
	});
});
