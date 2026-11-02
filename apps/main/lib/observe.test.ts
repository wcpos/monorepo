/**
 * Pins the Observe gates: nothing is dispatched before the merchant allows
 * reporting, never from a non-store build, and a refusal's events are discarded
 * before dispatching can resume. Flip any of them in lib/observe.ts and a test
 * here goes red.
 */
type ObserveModule = typeof import('./observe');
type ConfigureCall = { dispatchingEnabled?: boolean; dispatchInDebug?: boolean };

const mockConfigure = jest.fn<void, [ConfigureCall]>();
// Every discard is a deferred promise so a test can interleave consent changes
// with in-flight discards and settle them in any order.
let pendingDiscards: (() => void)[] = [];
const mockDispatchEvents = jest.fn<Promise<void>, []>(
	() =>
		new Promise<void>((resolve) => {
			pendingDiscards.push(resolve);
		})
);
let mockScheme = 'wcpos';

jest.mock('expo-observe', () => ({
	Observe: {
		configure: (config: ConfigureCall) => mockConfigure(config),
		dispatchEvents: () => mockDispatchEvents(),
	},
}));
jest.mock('@wcpos/utils/app-info', () => ({
	AppInfo: {
		get scheme() {
			return mockScheme;
		},
	},
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

async function settleDiscards(): Promise<void> {
	const resolvers = pendingDiscards;
	pendingDiscards = [];
	resolvers.forEach((resolve) => resolve());
	await flushPromises();
}

function loadObserve(): ObserveModule {
	jest.resetModules();
	return jest.requireActual('./observe');
}

function lastDispatching(): boolean | undefined {
	return mockConfigure.mock.calls.at(-1)?.[0].dispatchingEnabled;
}

describe('EAS Observe gates', () => {
	beforeEach(() => {
		mockConfigure.mockClear();
		mockDispatchEvents.mockClear();
		pendingDiscards = [];
		mockScheme = 'wcpos';
	});

	it('configures at import with dispatching OFF and the router integration on', () => {
		loadObserve();

		expect(mockConfigure).toHaveBeenCalledTimes(1);
		expect(mockConfigure).toHaveBeenLastCalledWith(
			expect.objectContaining({
				dispatchingEnabled: false,
				dispatchInDebug: false,
				integrations: {
					'expo-router': {
						// Path segments AND the id-bearing query parameters the app navigates with.
						filteredParams: expect.arrayContaining([
							'orderId',
							'customerId',
							'closureId',
							'registerId',
							'document',
							'store',
						]),
					},
				},
			})
		);
	});

	it('dispatches only while the merchant has allowed reporting, on the store build', async () => {
		const { setObserveConsent } = loadObserve();

		// Boot: no opinion yet, the import-time configuration stands.
		setObserveConsent(null);
		expect(mockConfigure).toHaveBeenCalledTimes(1);

		setObserveConsent('undecided');
		expect(lastDispatching()).toBe(false);

		setObserveConsent('allowed');
		expect(lastDispatching()).toBe(true);

		setObserveConsent('denied');
		expect(lastDispatching()).toBe(false);
		// A refusal discards what was collected: the SDK's disabled dispatch.
		expect(mockDispatchEvents).toHaveBeenCalledTimes(1);
		await settleDiscards();
		expect(lastDispatching()).toBe(false);
	});

	it('never dispatches from the dev client or an ad-hoc build', async () => {
		mockScheme = 'wcpos-dev';
		const { setObserveConsent } = loadObserve();

		setObserveConsent('allowed');
		setObserveConsent('denied');
		setObserveConsent('allowed');
		await settleDiscards();

		expect(mockConfigure.mock.calls.length).toBeGreaterThan(0);
		for (const [config] of mockConfigure.mock.calls) {
			expect(config.dispatchingEnabled).toBe(false);
			expect(config.dispatchInDebug).toBe(false);
		}
	});

	it('drops what a store that said no collected before dispatching resumes', async () => {
		const { setObserveConsent } = loadObserve();

		setObserveConsent('denied');
		expect(mockDispatchEvents).toHaveBeenCalledTimes(1);
		expect(lastDispatching()).toBe(false);
		await settleDiscards();

		// Another store takes over the till: the refusal's events are discarded first,
		// and dispatching resumes only once that discard has completed.
		setObserveConsent('allowed');
		expect(mockDispatchEvents).toHaveBeenCalledTimes(2);
		expect(lastDispatching()).toBe(false);
		await settleDiscards();
		expect(lastDispatching()).toBe(true);
	});

	it('applies the newest consent when a discard completes, never a stale one', async () => {
		const { setObserveConsent } = loadObserve();

		// denied → allowed → denied with every discard still in flight: ends OFF.
		setObserveConsent('denied');
		setObserveConsent('allowed');
		setObserveConsent('denied');
		await settleDiscards();
		expect(lastDispatching()).toBe(false);
		expect(mockConfigure.mock.calls.every(([config]) => config.dispatchingEnabled === false)).toBe(
			true
		);

		// denied → undecided → allowed with the discard still in flight: dispatching
		// stays OFF until the discard completes, then ends ON.
		setObserveConsent('undecided');
		setObserveConsent('allowed');
		expect(lastDispatching()).toBe(false);
		await settleDiscards();
		expect(lastDispatching()).toBe(true);
	});

	it('keeps a logged-out till silent without dropping what an allowed store collected', () => {
		const { setObserveConsent } = loadObserve();

		setObserveConsent('allowed');
		setObserveConsent('undecided');

		expect(lastDispatching()).toBe(false);
		expect(mockDispatchEvents).not.toHaveBeenCalled();
	});

	it('does not re-send an unchanged configuration', () => {
		const { setObserveConsent } = loadObserve();

		setObserveConsent('undecided');
		setObserveConsent('undecided');
		expect(mockConfigure).toHaveBeenCalledTimes(1);

		setObserveConsent('allowed');
		setObserveConsent('allowed');
		expect(mockConfigure).toHaveBeenCalledTimes(2);
	});
});
