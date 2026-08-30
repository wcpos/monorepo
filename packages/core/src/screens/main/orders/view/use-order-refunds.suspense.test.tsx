/**
 * @jest-environment jsdom
 *
 * `useOrderRefunds` builds an `ObservableResource` in a `useMemo` during render — the shape
 * that loops in the Orders filter bar (#1707) — and it is deliberately left that way, with no
 * cache. This file is what holds that decision to account.
 *
 * A render-built resource is only discarded when its builder is INSIDE the boundary that
 * catches the suspension: React unwinds to the boundary and throws away the work-in-progress
 * fibers below it, `useMemo` included. `RefundsResourceBoundary` builds the resource and
 * renders the `Suspense` (and the error boundary) BELOW itself, so it commits alongside the
 * skeleton and the retry reads back the resource whose GET is already in flight.
 *
 * A cache would be the wrong fix even though it would also stop a loop: refunds are an HTTP
 * GET with no live subscription behind it, so an entry keyed by order id would serve a snapshot
 * forever — a refund taken on another till would never show up. Per mount is the point.
 *
 * Kept out of `modal.test.tsx` because that file mocks `observable-hooks` wholesale and stubs
 * `useOrderRefunds` to `{}`, so nothing in it can suspend.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { of } from 'rxjs';

import { ViewOrderModal } from './modal';

let getCalls: string[] = [];
let resolveRefunds: (value: { data: unknown[] }) => void;

const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 23858, status: 'completed', currency_symbol: '$' },
} as never;

jest.mock('react-native', () => ({
	ScrollView: ({ children }: any) => <div data-testid="modal-scroll">{children}</div>,
	View: ({ children }: any) => <div>{children}</div>,
	useWindowDimensions: () => ({ width: 1024 }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: typeof mockOrder, select: (record: typeof mockOrder) => unknown) =>
		select(record),
}));
jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({
		get: (path: string) => {
			getCalls.push(path);
			// Never settles until the test says so, which is what keeps the consumer suspended
			// across several attempts.
			return new Promise((resolve) => {
				resolveRefunds = resolve as (value: { data: unknown[] }) => void;
			});
		},
	}),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: any) => <button type="button">{children}</button>,
	ButtonText: ({ children }: any) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: any) => <>{children}</>,
}));
jest.mock('@wcpos/components/modal', () => ({
	Modal: ({ children }: any) => <div>{children}</div>,
	ModalBody: ({ children }: any) => <div>{children}</div>,
	ModalClose: ({ children }: any) => <button type="button">{children}</button>,
	ModalContent: ({ children }: any) => <div>{children}</div>,
	ModalFooter: ({ children }: any) => <div data-testid="order-view-modal-footer">{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: any) => <span>{children}</span>,
}));
jest.mock('./sections/header', () => ({ HeaderSection: () => <div data-testid="header" /> }));
jest.mock('./sections/customer', () => ({
	AddressesRail: () => <div />,
	CustomerNoteSection: () => <div />,
	CustomerRail: () => <div data-testid="customer-rail" />,
	TaxIdsRail: () => <div />,
}));
jest.mock('./sections/line-items', () => ({ LineItemsSection: () => <div /> }));
jest.mock('./sections/payment', () => ({ PaymentSection: () => <div /> }));
jest.mock('./sections/pos-metadata', () => ({ POSMetadataSection: () => <div /> }));
// Stands in for the real section at the one thing that matters here: it suspends on the
// resource `RefundsResourceBoundary` hands it.
jest.mock('./sections/refunds', () => ({
	RefundsFallback: () => <div data-testid="refunds-fallback" />,
	RefundsSkeleton: () => <div data-testid="refunds-skeleton" />,
	RefundsSection: ({ resource }: { resource: ObservableResource<unknown[]> }) => (
		<div data-testid="refunds-section">{useObservableSuspense(resource).length}</div>
	),
}));
jest.mock('./sections/totals', () => ({ TotalsSection: () => <div /> }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

/** Lets every pending microtask (and the React retry it schedules) run. */
async function settle() {
	for (let i = 0; i < 25; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
}

const orderResource = new ObservableResource(of(mockOrder)) as never;

beforeEach(() => {
	getCalls = [];
});

describe('the refunds resource, built above the boundary that suspends on it', () => {
	it('asks the server once, however many attempts the refunds section takes', async () => {
		render(
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<ViewOrderModal resource={orderResource} />
			</React.Suspense>
		);
		await settle();

		// Still waiting on the server, so this is the state the retries happen in.
		expect(screen.getByTestId('refunds-skeleton')).toBeTruthy();
		expect(screen.queryByTestId('route-fallback')).toBeNull();
		// The rest of the modal is on screen: the suspension is contained.
		expect(screen.getByTestId('customer-rail')).toBeTruthy();

		await React.act(async () => {
			resolveRefunds({ data: [{ id: 1, total: '-5.00' }] });
		});
		await settle();

		expect((await screen.findByTestId('refunds-section')).textContent).toBe('1');
		// One GET. A builder inside the suspending subtree would have fired a fresh request on
		// every retry — which is the second reason this shape matters for an HTTP resource.
		expect(getCalls).toEqual(['orders/23858/refunds']);
	});
});
