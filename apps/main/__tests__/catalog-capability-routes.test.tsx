import * as React from 'react';

import { act, create } from 'react-test-renderer';

import CouponsLayout from '../app/(app)/(drawer)/coupons/_layout';
import CustomersLayout from '../app/(app)/(drawer)/customers/_layout';
import ProductsLayout from '../app/(app)/(drawer)/products/_layout';

// Avoid jest-expo's winter runtime resolving lazy globals between tests.
jest.resetModules();

const mockCaps = {
	canEditProducts: true,
	canEditVariations: true,
	canCreateCoupons: true,
	canEditCoupons: true,
	canCreateCustomers: true,
	canEditCustomers: true,
};
const mockRenderedRoutes: string[] = [];

jest.mock('expo-router', () => {
	function Stack({ children }: { children: React.ReactNode }) {
		return <>{children}</>;
	}
	function MockStackScreen({ name }: { name: string }) {
		mockRenderedRoutes.push(name);
		return null;
	}
	function MockStackProtected({ guard, children }: { guard: boolean; children: React.ReactNode }) {
		return guard ? <>{children}</> : null;
	}
	Stack.Screen = MockStackScreen;
	Stack.Protected = MockStackProtected;
	return { Stack };
});
jest.mock('../components/use-navigation-background', () => ({
	useNavigationBackground: () => '#fff',
}));
jest.mock('@wcpos/core/screens/main/hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: mockCaps, known: true }),
}));

function routeNames(Layout: React.ComponentType): string[] {
	mockRenderedRoutes.length = 0;
	let view: ReturnType<typeof create>;
	act(() => {
		view = create(<Layout />);
	});
	act(() => view.unmount());
	return [...mockRenderedRoutes];
}

describe('catalog capability route guards', () => {
	it('guards product and variation edit destinations independently', () => {
		mockCaps.canEditProducts = false;
		mockCaps.canEditVariations = true;
		expect(routeNames(ProductsLayout)).toEqual(['index', '(modals)/edit/variation/[variationId]']);

		mockCaps.canEditProducts = true;
		mockCaps.canEditVariations = false;
		expect(routeNames(ProductsLayout)).toEqual(['index', '(modals)/edit/product/[productId]']);
	});

	it('guards coupon add and edit destinations independently', () => {
		mockCaps.canCreateCoupons = true;
		mockCaps.canEditCoupons = false;
		expect(routeNames(CouponsLayout)).toEqual(['index', '(modals)/add']);
	});

	it('guards customer add and edit destinations independently', () => {
		mockCaps.canCreateCustomers = false;
		mockCaps.canEditCustomers = true;
		expect(routeNames(CustomersLayout)).toEqual(['index', '(modals)/edit/[customerId]']);
	});
});
