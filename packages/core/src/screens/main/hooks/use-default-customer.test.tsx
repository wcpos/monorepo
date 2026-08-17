import * as React from 'react';

import { act, create } from 'react-test-renderer';
import { of } from 'rxjs';

import { useDefaultCustomer } from './use-default-customer';

const mockUseCollectionBinding = jest.fn();
let mockDefaultCustomerID = 0;

jest.mock('../../../query', () => ({
	useCollectionBinding: (...args: unknown[]) => mockUseCollectionBinding(...args),
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
