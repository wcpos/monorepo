/**
 * Pins the two Observe gates: nothing is dispatched before the merchant allows
 * reporting, and never from a non-store build. Flip either in lib/observe.ts and
 * a test here goes red.
 */
type ObserveModule = typeof import('./observe');
type ConfigureCall = { dispatchingEnabled?: boolean; dispatchInDebug?: boolean };

const mockConfigure = jest.fn<void, [ConfigureCall]>();
const mockClearStoredEntries = jest.fn<Promise<void>, []>(() => Promise.resolve());
let mockScheme = 'wcpos';

jest.mock('expo-observe', () => ({
	Observe: { configure: (config: ConfigureCall) => mockConfigure(config) },
	AppMetrics: { clearStoredEntries: () => mockClearStoredEntries() },
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
jest.mock('@wcpos/utils/app-info', () => ({
	AppInfo: {
		get scheme() {
			return mockScheme;
		},
	},
}));

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
		mockClearStoredEntries.mockClear();
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
						// Path segments AND the query-string ids the app navigates with.
						filteredParams: expect.arrayContaining([
							'orderId',
							'customerId',
							'closureId',
							'registerId',
							'store',
						]),
					},
				},
			})
		);
	});

	it('dispatches only while the merchant has allowed reporting, on the store build', () => {
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
		expect(mockClearStoredEntries).toHaveBeenCalledTimes(1);
	});

	it('drops what a store that said no collected, before dispatching resumes', async () => {
		const { setObserveConsent } = loadObserve();

		setObserveConsent('denied');
		expect(mockClearStoredEntries).toHaveBeenCalledTimes(1);
		expect(lastDispatching()).toBe(false);

		// Another store takes over the till: the refusal's events are dropped first,
		// and dispatching resumes only once that has completed.
		setObserveConsent('allowed');
		expect(mockClearStoredEntries).toHaveBeenCalledTimes(2);
		expect(lastDispatching()).toBe(false);
		await flushPromises();
		expect(lastDispatching()).toBe(true);
	});

	it('keeps a logged-out till silent without dropping what an allowed store collected', () => {
		const { setObserveConsent } = loadObserve();

		setObserveConsent('allowed');
		setObserveConsent('undecided');

		expect(lastDispatching()).toBe(false);
		expect(mockClearStoredEntries).not.toHaveBeenCalled();
	});

	it('never dispatches from the dev client or an ad-hoc build', () => {
		mockScheme = 'wcpos-dev';
		const { setObserveConsent } = loadObserve();

		setObserveConsent('allowed');

		expect(mockConfigure.mock.calls.length).toBeGreaterThan(0);
		for (const [config] of mockConfigure.mock.calls) {
			expect(config.dispatchingEnabled).toBe(false);
			expect(config.dispatchInDebug).toBe(false);
		}
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
