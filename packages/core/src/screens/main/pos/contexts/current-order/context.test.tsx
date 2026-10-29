/** @jest-environment jsdom */
import * as React from 'react';

import { renderHook } from '@testing-library/react';

import {
	CurrentOrderContext,
	type CurrentOrderContextProps,
	useOpenOrdersOptional,
} from './context';

it('returns no open orders outside the provider', () => {
	expect(renderHook(() => useOpenOrdersOptional()).result.current).toEqual([]);
});
it("returns the provider's open orders inside", () => {
	const openOrders = [{ id: 'cart', record: { id: 'cart', payload: {} } }];
	const value = { openOrders } as unknown as CurrentOrderContextProps;
	const wrapper = ({ children }: React.PropsWithChildren) => (
		<CurrentOrderContext.Provider value={value}>{children}</CurrentOrderContext.Provider>
	);
	expect(renderHook(() => useOpenOrdersOptional(), { wrapper }).result.current).toBe(openOrders);
});
