import * as React from 'react';

import { act, create } from 'react-test-renderer';
import { of } from 'rxjs';

import { useDefaultCustomer } from './use-default-customer';

const mockUseCollectionBinding = jest.fn();
let mockDefaultCustomerID = 0;

jest.mock('../../../query', () => ({
	useCollectionBinding: (...args: unknown[]) => mockUseCollectionBinding(...args),
}));
// The hook holds its Suspense resource in the query runtime's bridge rather than a `useMemo`
// (see `useSuspenseResource`), so it now needs a runtime. Nothing this file asserts changes:
// the bridge is scoped on the engine, and an empty stub is a perfectly good scope object.
jest.mock('@wcpos/query', () => ({
	// `active()` is part of the engine surface: the bridge key names the scope, because a
	// same-site store switch mutates the engine in place (see use-default-customer.ts).
	useQueryRuntime: () => ({ engine: { active: () => ({ scopeId: 'test-scope' }) } }),
	useSuspenseResource: jest.requireActual('../../../../../query/src/suspense-resource')
		.useSuspenseResource,
}));
jest.mock('./use-default-customer-id', () => ({
	useDefaultCustomerID: () => mockDefaultCustomerID,
}));
jest.mock('../hooks/use-guest-customer', () => ({
	useGuestCustomer: () => ({ id: 0, billing: {}, shipping: {} }),
}));

function Harness() {
	useDefaultCustomer();
	return null;
}

describe('useDefaultCustomer', () => {
	beforeEach(() => {
		mockUseCollectionBinding.mockReset();
		mockUseCollectionBinding.mockReturnValue({ result$: of({ hits: [] }) });
	});

	it('declares no woo target for the guest default (0) — an include=0 pull jams the customers cursor (#850)', () => {
		mockDefaultCustomerID = 0;
		act(() => {
			create(<Harness />);
		});
		expect(mockUseCollectionBinding).toHaveBeenCalledWith('customers', expect.any(Object), {
			remoteIds: [],
		});
	});

	it('targets the configured woo customer when the default is a real id', () => {
		mockDefaultCustomerID = 42;
		act(() => {
			create(<Harness />);
		});
		expect(mockUseCollectionBinding).toHaveBeenCalledWith('customers', expect.any(Object), {
			remoteIds: ['42'],
		});
	});
});
