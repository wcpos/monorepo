/**
 * @jest-environment jsdom
 *
 * #1707 on the handle: the OWNER (`TaxRates`) acquires the tax-rates handle and retains it
 * from an effect, above the `Suspense` its reader (`TaxRatesContent`) suspends on. An owner
 * that also read would suspend uncommitted: nothing would retain the handle, the read would
 * never start, `whenAnswered()` would never settle, and the fallback would never leave. The
 * modal's boundary in `index.tsx` is above the owner and no help.
 *
 * The mock hook is faithful to `useCollectionQueryHandle` where this file measures: the handle
 * is memoised on the fiber, joins the by-key registry only once retained (the real one claims
 * the key on start) and leaves it on the last release, and its read starts on that retain.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { TaxRates } from './tax-rates';

type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
	retained: number;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>, key?: string) => FakeHandle;
};

let mockCreated: FakeHandle[] = [];
let mockRegistry = new Map<string, FakeHandle>();

/** One handle per key while retained; a handle never retained never joined the registry. */
function mockAcquire(key: string): FakeHandle {
	const live = mockRegistry.get(key);
	if (live) return live;
	const handle = fakeQueryHandle({ ready: false }, key);
	mockCreated.push(handle);
	const retain = handle.retain;
	handle.retain = () => {
		mockRegistry.set(key, handle);
		const release = retain();
		const leave = () => {
			release();
			if (handle.retained === 0 && mockRegistry.get(key) === handle) mockRegistry.delete(key);
		};
		// The owner's retain starts the read; its first answer is one microtask later.
		void Promise.resolve().then(() => handle.set({ ready: true, result: { hits: [] } }));
		return leave;
	};
	return handle;
}

jest.mock('../../../query', () => ({
	...jest.requireActual('../../../query'),
	useQueryState: () => ({}),
	useCollectionQueryHandle: (_collection: unknown, state: unknown) => {
		const key = JSON.stringify(state);
		const handle = React.useMemo(() => mockAcquire(key), [key]);
		React.useEffect(() => handle.retain(), [handle]);
		return handle;
	},
}));
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useDocField: () => [{ name: 'Standard', slug: '' }],
}));
// The real boundary without the app's fallback (whose icon pulls in the styling runtime).
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	return {
		ErrorBoundary: ({ children, onReset }: { children: React.ReactNode; onReset?: () => void }) => (
			<ErrorBoundary onReset={onReset} fallback={<div data-testid="tax-rates-error" />}>
				{children}
			</ErrorBoundary>
		),
	};
});
jest.mock('../contexts/extra-data', () => ({ useExtraData: () => ({ extraData: {} }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('./footer', () => ({ TaxRatesFooter: () => <div data-testid="tax-rates-footer" /> }));
jest.mock('./rate-table', () => ({ TaxRateTable: () => <div data-testid="tax-rate-table" /> }));

function passthrough({ children }: { children?: React.ReactNode }) {
	return <div>{children}</div>;
}
jest.mock('@wcpos/components/modal', () => ({
	Modal: passthrough,
	ModalBody: passthrough,
	ModalClose: passthrough,
	ModalContent: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="tax-rates-modal">{children}</div>
	),
	ModalFooter: passthrough,
	ModalHeader: passthrough,
	ModalTitle: passthrough,
}));
jest.mock('@wcpos/components/tabs', () => ({
	Tabs: passthrough,
	TabsContent: passthrough,
	TabsTrigger: passthrough,
	ScrollableTabsList: passthrough,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

/** Lets every pending microtask (and the React retry it schedules) run. */
async function settle() {
	for (let i = 0; i < 25; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
}

beforeEach(() => {
	mockCreated = [];
	mockRegistry = new Map();
});

describe('the tax rates modal', () => {
	it('mounts on the first answer, having acquired and retained the rates handle once', async () => {
		render(
			<React.Suspense fallback={<div data-testid="modal-fallback" />}>
				<TaxRates />
			</React.Suspense>
		);
		await settle();

		expect(await screen.findByTestId('tax-rates-modal')).toBeTruthy();
		// The instruments: one handle for the stable key, held by the owner's one retain.
		expect(mockCreated).toHaveLength(1);
		expect(mockCreated[0]?.retained).toBe(1);
	});
});
