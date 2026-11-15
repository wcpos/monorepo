/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, renderHook, screen } from '@testing-library/react';

import { NoStoreNotice, NoStoreProvider, useNoStoreSummary } from './no-store';

import type { QueryHandle } from '../../../query';

jest.mock('../../../query', () => ({ useQueryHandleValue: () => mockSnapshot }));
jest.mock('./scope', () => ({ useReportsFilterScope: () => mockScope }));
jest.mock('./context', () => ({
	useIncludedStatus: () => (order: { status: string }) =>
		['completed', 'processing'].includes(order.status),
}));
jest.mock('../../../hooks/use-store-day', () => ({
	useViewedStore: () => ({ price_num_decimals: 2 }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (value: unknown, select: (value: unknown) => unknown) => select(value),
}));
jest.mock('./use-report-formats', () => ({
	useReportFormats: () => ({ money: (n: number) => `€${n.toFixed(2)}`, quantity: String }),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({ Text: require('react-native').Text }));
jest.mock('@wcpos/components/button', () => ({
	Button: require('react-native').Pressable,
	ButtonText: require('react-native').Text,
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

const hits = ['completed', 'completed', 'completed', 'completed', 'pending'].map((status, i) => ({
	record: { uuid: String(i), payload: { status, total: '1.22', created_via: 'woocommerce-pos' } },
}));
let mockSnapshot = { ready: true, error: null as Error | null, result: { hits } };
let mockScope = { storeId: 7, allStores: false, noStore: false, registerId: '' };
const onView = jest.fn();
const handle = {} as QueryHandle;
function Wrapper({ children, enabled = true }: React.PropsWithChildren<{ enabled?: boolean }>) {
	return (
		<NoStoreProvider handle={handle} enabled={enabled} onView={onView}>
			{children}
		</NoStoreProvider>
	);
}
beforeEach(() => {
	mockSnapshot = { ready: true, error: null, result: { hits } };
	mockScope = { storeId: 7, allStores: false, noStore: false, registerId: '' };
	onView.mockClear();
});

it('summarises four completed orders at the store precision and excludes pending', () => {
	const { result } = renderHook(useNoStoreSummary, { wrapper: Wrapper });
	expect(result.current).toEqual({ count: 4, amount: 4.88, view: onView });
});
it('has no summary when disabled', () => {
	const { result } = renderHook(useNoStoreSummary, {
		wrapper: ({ children }) => <Wrapper enabled={false}>{children}</Wrapper>,
	});
	expect(result.current).toBeUndefined();
});
it.each([{ ready: false }, { error: new Error('read failed') }])(
	'has no summary for %j',
	(snapshot) => {
		mockSnapshot = { ...mockSnapshot, ...snapshot };
		expect(renderHook(useNoStoreSummary, { wrapper: Wrapper }).result.current).toBeUndefined();
	}
);
it('shows the store notice and opens No store once', () => {
	render(<NoStoreNotice />, { wrapper: Wrapper });
	expect(screen.getByTestId('reports-no-store-notice')).toBeTruthy();
	expect(screen.getByTestId('reports-no-store-notice-title').textContent).toBe(
		'4 orders (€4.88) are not assigned to a store'
	);
	fireEvent.click(screen.getByTestId('reports-no-store-view'));
	expect(onView).toHaveBeenCalledTimes(1);
});
it('has no notice for zero orders', () => {
	mockSnapshot.result = { hits: [] };
	expect(render(<NoStoreNotice />, { wrapper: Wrapper }).container.textContent).toBe('');
});
it.each([{ allStores: true }, { noStore: true }, { registerId: 'front' }])(
	'has no notice for scope %j',
	(scope) => {
		mockScope = { ...mockScope, ...scope };
		expect(render(<NoStoreNotice />, { wrapper: Wrapper }).container.textContent).toBe('');
	}
);
