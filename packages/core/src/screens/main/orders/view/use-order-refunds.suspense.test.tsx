/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { BehaviorSubject, of, Subject } from 'rxjs';

import { ViewOrderModal } from './modal';
import { useOrderRefunds } from './use-order-refunds';

let mockLocal = new Subject<{
	hits: { record: { payload: { id: number; date_created_gmt: string } } }[];
}>();
const mockDatabases = new BehaviorSubject({ collections: { refunds: {}, orders: {} } });
const mockRelease = jest.fn();
const mockRequire = jest.fn();
const mockObserve = jest.fn((..._args: unknown[]) => mockLocal);
const mockEngine = { require: mockRequire };
const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 23858, status: 'completed', currency_symbol: '$', refunds: [{ id: 99 }] },
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
	useQueryRuntime: () => ({ engine: mockEngine, locale: 'en' }),
	observeEngineQuery: (...args: unknown[]) => mockObserve(...args),
	observeEngineDatabases: () => mockDatabases,
	declareRequirements: (_engine: unknown, requirements: unknown[]) =>
		requirements.map((r) => {
			const handle = mockRequire(r);
			handle.ready.catch(() => undefined);
			return handle;
		}),
}));
jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: () => new Promise(() => {}) }),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: any) => <button type="button">{children}</button>,
	ButtonText: ({ children }: any) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: jest.requireActual('react-error-boundary').ErrorBoundary,
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
	RefundsFallback: ({ onRetry }: { onRetry: () => void }) => (
		<button data-testid="refunds-fallback" onClick={onRetry} />
	),
	RefundsSkeleton: () => <div data-testid="refunds-skeleton" />,
	RefundsSection: ({ resource }: { resource: ObservableResource<{ id: number }[]> }) => (
		<div data-testid="refunds-section">
			{useObservableSuspense(resource)
				.map((row) => row.id)
				.join(',')}
		</div>
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
	mockLocal = new Subject();
	mockRequire.mockReset().mockReturnValue({ ready: new Promise(() => {}), release: mockRelease });
	mockRelease.mockClear();
	mockObserve.mockClear();
});
const show = () =>
	render(
		<React.Suspense fallback={<div data-testid="route-fallback" />}>
			<ViewOrderModal resource={orderResource} />
		</React.Suspense>
	);
const publish = async (ids: number[]) =>
	React.act(async () => {
		mockLocal.next({
			hits: ids.map((id) => ({ record: { payload: { id, date_created_gmt: `2026-09-${id}` } } })),
		});
	});

describe('local-first live order refunds', () => {
	// Revert resource ownership to a passive effect: the new order commits the old order's rows.
	it('replaces an in-place order resource before layout can expose previous rows', async () => {
		const committed: number[][] = [];
		function Probe({ orderId }: { orderId: number }) {
			const resource = useOrderRefunds(orderId);
			React.useLayoutEffect(() => {
				try {
					if (!resource.isDestroyed) committed.push(resource.read().map((row) => row.id));
				} catch {
					/* suspended or destroyed */
				}
			});
			return null;
		}
		const view = render(<Probe orderId={42} />);
		await publish([1]);
		view.rerender(<Probe orderId={42} />);
		expect(committed).toContainEqual([1]);
		committed.length = 0;
		mockLocal = new Subject();
		view.rerender(<Probe orderId={43} />);
		expect(committed).not.toContainEqual([1]);
		await publish([2]);
		view.rerender(<Probe orderId={43} />);
		expect(committed).toContainEqual([2]);
	});

	// Keep the destroyed memoized resource on replay: the section never receives these rows.
	it('keeps yielding live refunds after StrictMode effect replay without a destroyed error', async () => {
		const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const view = render(
				<React.StrictMode>
					<React.Suspense fallback={<div data-testid="route-fallback" />}>
						<ViewOrderModal resource={orderResource} />
					</React.Suspense>
				</React.StrictMode>
			);
			await settle();
			await publish([1, 2]);
			expect((await screen.findByTestId('refunds-section')).textContent).toBe('2,1');
			await publish([3]);
			expect(screen.getByTestId('refunds-section').textContent).toBe('3');
			expect(screen.queryByTestId('refunds-fallback')).toBeNull();
			expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/destroyed/i);
			view.unmount();
			expect(mockLocal.observed).toBe(false);
		} finally {
			errors.mockRestore();
		}
	});

	it('contains local loading and renders sorted rows without waiting for refresh readiness', async () => {
		show();
		await settle();
		expect(screen.getByTestId('refunds-skeleton')).toBeTruthy();
		expect(screen.queryByTestId('route-fallback')).toBeNull();
		expect(screen.getByTestId('customer-rail')).toBeTruthy();
		await publish([1, 2]);
		expect((await screen.findByTestId('refunds-section')).textContent).toBe('2,1');
		expect(mockObserve).toHaveBeenCalledWith(
			mockEngine,
			'en',
			expect.objectContaining({ collection: 'refunds', selector: { parent_id: 23858 } })
		);
		expect(mockRequire).toHaveBeenCalledTimes(1);
		expect(mockRequire).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'refunds-by-parent',
				parentRemoteId: '23858',
				forceRefresh: true,
			})
		);
	});
	it('reflects live inserts and deletions and releases local and remote subscriptions', async () => {
		const view = show();
		await publish([1]);
		await publish([1, 3]);
		expect(screen.getByTestId('refunds-section').textContent).toBe('3,1');
		await publish([]);
		expect(screen.getByTestId('refunds-section').textContent).toBe('');
		view.unmount();
		expect(mockRelease).toHaveBeenCalled();
		expect(mockLocal.observed).toBe(false);
	});
	it.each([{ ids: [1] }, { ids: [] }])(
		'refresh failure retains the local result %j, never the summary fallback',
		async ({ ids }) => {
			mockRequire.mockImplementation(() => ({
				ready: Promise.reject(new Error('offline')),
				release: mockRelease,
			}));
			show();
			await publish(ids);
			await settle();
			expect(screen.getByTestId('refunds-section').textContent).toBe(ids.join(','));
			expect(screen.queryByTestId('refunds-fallback')).toBeNull();
		}
	);
	it('local read failure shows the summary fallback; Retry re-declares forcibly', async () => {
		const silence = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			show();
			await React.act(async () => mockLocal.error(new Error('local read failed')));
			expect(screen.getByTestId('refunds-fallback')).toBeTruthy();
			mockLocal = new Subject();
			fireEvent.click(screen.getByTestId('refunds-fallback'));
			await publish([4]);
			expect(screen.getByTestId('refunds-section').textContent).toBe('4');
			expect(mockRequire).toHaveBeenCalledTimes(2);
			expect(mockRequire.mock.calls[1][0].forceRefresh).toBe(true);
		} finally {
			silence.mockRestore();
		}
	});
	// Revert to watching only refunds identity: an orders reset never refills cascaded detail rows.
	it('redeclares a forced by-parent pull when only the orders collection is replaced', async () => {
		show();
		await publish([]);
		const { refunds, orders } = mockDatabases.value.collections;
		await React.act(async () => mockDatabases.next({ collections: { refunds, orders } }));
		expect(mockRequire).toHaveBeenCalledTimes(1);
		await React.act(async () => mockDatabases.next({ collections: { refunds, orders: {} } }));
		expect(mockRelease).toHaveBeenCalledTimes(1);
		expect(mockRequire).toHaveBeenCalledTimes(2);
		expect(mockRequire).toHaveBeenLastCalledWith({
			id: 'refunds:order-detail:23858',
			kind: 'refunds-by-parent',
			collection: 'refunds',
			parentRemoteId: '23858',
			forceRefresh: true,
		});
	});
	it('reopening or replacing the refund collection declares a fresh forced pull', async () => {
		const first = show();
		await publish([]);
		first.unmount();
		show();
		await publish([]);
		await React.act(async () =>
			mockDatabases.next({
				collections: { refunds: {}, orders: mockDatabases.value.collections.orders },
			})
		);
		expect(mockRequire).toHaveBeenCalledTimes(3);
		expect(mockRequire.mock.calls.every(([r]) => r.forceRefresh)).toBe(true);
	});
});
