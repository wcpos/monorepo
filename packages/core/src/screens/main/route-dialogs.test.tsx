/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';
import type { ViewProps } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';
import { router } from 'expo-router';

import { EditOrderModal } from './orders/edit/modal';
import { RefundOrderModal } from './orders/refund/modal';
import { EditProductModal } from './products/edit/product/modal';
import { EditVariationModal } from './products/edit/variation/modal';
import { AddCustomerScreen } from './customers/add';
import { EditCustomer } from './customers/edit/edit-customer';
import { AddCouponScreen } from './coupons/add';
import { EditCoupon } from './coupons/edit/edit-coupon';
import { TaxRates } from './tax-rates/tax-rates';

let mockPhone = false;
let mockRecord: { uuid: string; payload: { id: number; name: string; code: string } } | null;
function mockView({ children, className, testID }: ViewProps) {
	return (
		<div className={className} data-testid={testID}>
			{children}
		</div>
	);
}
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: mockView,
	ScrollView: mockView,
}));
jest.mock('react-native-reanimated', () => {
	const animation = { duration: () => animation, easing: () => animation };
	return {
		__esModule: true,
		default: { View: mockView },
		Easing: { bezier: () => 'ease' },
		...Object.fromEntries(
			[
				'FadeIn',
				'FadeOut',
				'SlideInDown',
				'SlideInLeft',
				'SlideInRight',
				'SlideOutDown',
				'SlideOutLeft',
				'SlideOutRight',
			].map((key) => [key, animation])
		),
	};
});
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
	const router = { back: jest.fn() };
	return { router, useRouter: () => router, useLocalSearchParams: () => ({}) };
});
jest.mock('@wcpos/components/keyboard-controller', () => ({ KeyboardAvoidingView: mockView }));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));
// Keep the real v2 root, shell and parts. Replace only platform primitives and unrelated forms.
jest.mock('@rn-primitives/dialog', () => {
	const Context = React.createContext({ open: false, onOpenChange: (_open: boolean) => {} });
	return {
		Root: ({
			children,
			open = false,
			onOpenChange = () => {},
		}: React.PropsWithChildren<{ open?: boolean; onOpenChange?: (open: boolean) => void }>) => (
			<Context.Provider value={{ open, onOpenChange }}>{children}</Context.Provider>
		),
		Content: ({ children, className, testID }: ViewProps) => (
			<div role="dialog" className={className} data-testid={testID}>
				{children}
			</div>
		),
		Overlay: mockView,
		Title: mockView,
		Close: ({ children }: React.PropsWithChildren) => {
			const { onOpenChange } = React.useContext(Context);
			return React.isValidElement<{ onPress?: () => void }>(children)
				? React.cloneElement(children, { onPress: () => onOpenChange(false) })
				: null;
		},
		useRootContext: () => React.useContext(Context),
	};
});
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
		React.isValidElement(children) ? React.cloneElement(children, props) : null,
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress?: () => void; testID?: string }) => (
		<button aria-label="Close" data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/button', () => ({ Button: mockView }));
jest.mock('@wcpos/components/text', () => ({
	Text: mockView,
	TextClassContext: React.createContext(''),
}));
jest.mock('@wcpos/components/tree', () => ({ Tree: () => null }));
jest.mock('@wcpos/components/tabs', () => ({
	ScrollableTabsList: mockView,
	Tabs: mockView,
	TabsContent: mockView,
	TabsList: mockView,
	TabsTrigger: mockView,
}));
jest.mock('observable-hooks', () => ({ useObservableSuspense: () => mockRecord }));
jest.mock('@wcpos/query', () => ({
	useDocField: () => [],
	useRecordField: (
		record: typeof mockRecord,
		select: (record: NonNullable<typeof mockRecord>) => unknown
	) => (record ? select(record) : undefined),
}));
jest.mock('../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('./orders/edit/form', () => ({ EditOrderForm: () => null }));
jest.mock('./orders/refund/form', () => ({ RefundOrderForm: () => null }));

jest.mock('./products/edit/product/form', () => ({ EditProductForm: () => null }));

jest.mock('./products/edit/variation/form', () => ({ EditVariationForm: () => null }));

jest.mock('./customers/edit/form', () => ({ EditCustomerForm: () => null }));

jest.mock('./hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Customer' }),
}));

jest.mock('./coupons/edit/form', () => ({ EditCouponForm: () => null }));

jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: () => undefined }));
jest.mock('./hooks/mutations/use-mutation', () => ({ useMutation: () => ({ create: jest.fn() }) }));
jest.mock('./hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: jest.fn() }),
}));
jest.mock('./components/customer/customer-form', () => ({
	CustomerForm: () => null,
	customerFormSchema: {},
}));
jest.mock('./components/coupon/coupon-form', () => ({
	CouponForm: () => null,
	couponFormSchema: {},
}));

jest.mock('@wcpos/components/error-boundary', () => ({ ErrorBoundary: mockView }));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: mockView }));
jest.mock('../../query', () => ({
	useQueryState: () => ({}),
	useCollectionQueryHandle: () => ({}),
	useDrawnHandle: () => ({}),
	useQuerySnapshot: () => ({ result: { hits: [] } }),
}));
jest.mock('./contexts/extra-data', () => ({ useExtraData: () => ({ extraData: {} }) }));
jest.mock('./tax-rates/footer', () => ({ TaxRatesFooter: () => null }));
jest.mock('./tax-rates/rate-table', () => ({ TaxRateTable: () => null }));

beforeEach(() => jest.clearAllMocks());

// The add screens take no resource; these adapters let them share the rows below.
function AddCustomerRoute(_props: { resource: unknown }) {
	return <AddCustomerScreen />;
}
function AddCouponRoute(_props: { resource: unknown }) {
	return <AddCouponScreen />;
}

// Removing route would close the primitive instead of navigating back; reverting to Modal
// loses the phone page. Run both loaded and missing records so the early-return shell counts.
describe.each([
	['product', EditProductModal, 'w-lg'],
	['variation', EditVariationModal, 'w-lg'],
	['customer', EditCustomer, 'w-160'],
	['customer add', AddCustomerRoute, 'w-160'],
	['coupon', EditCoupon, 'w-lg'],
	['coupon add', AddCouponRoute, 'w-lg'],
	['order edit', EditOrderModal, 'w-160'],
	['order refund', RefundOrderModal, 'w-160'],
] as const)('%s route shell', (_name, Screen, width) => {
	it.each([false, true])('keeps desktop width or becomes a phone page (phone=%s)', (phone) => {
		mockPhone = phone;
		for (const record of [
			null,
			{ uuid: 'record', payload: { id: 42, name: 'Record', code: 'CODE' } },
		]) {
			mockRecord = record;
			const view = render(<Screen resource={{} as never} />);
			const panel = screen.getByRole('dialog');
			expect(panel).toHaveClass(phone ? 'w-full' : width);
			expect(panel).toHaveClass(phone ? 'border-0' : 'h-full');
			fireEvent.click(screen.getByRole('button', { name: 'Close' }));
			expect(router.back).toHaveBeenCalledTimes(1);
			jest.clearAllMocks();
			view.unmount();
		}
	});
});

it.each([false, true])(
	'tax rates keeps its wide desktop panel or phone page (phone=%s)',
	(phone) => {
		mockPhone = phone;
		render(<TaxRates />);
		expect(screen.getByRole('dialog')).toHaveClass(phone ? 'w-full' : 'w-200');
		fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(router.back).toHaveBeenCalledTimes(1);
	}
);
