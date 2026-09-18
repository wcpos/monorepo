/**
 * Pins the two Observe gates: nothing is dispatched before the merchant allows
 * reporting, and never from a non-store build. Flip either in lib/observe.ts and
 * a test here goes red.
 */
type ObserveModule = typeof import('./observe');
type ConfigureCall = { dispatchingEnabled?: boolean; dispatchInDebug?: boolean };

const mockConfigure = jest.fn<void, [ConfigureCall]>();
let mockScheme = 'wcpos';

jest.mock('expo-observe', () => ({
	Observe: { configure: (config: ConfigureCall) => mockConfigure(config) },
}));
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
					'expo-router': { filteredParams: expect.arrayContaining(['orderId', 'customerId']) },
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
		setObserveConsent('denied');
		expect(mockConfigure).toHaveBeenCalledTimes(1);

		setObserveConsent('allowed');
		setObserveConsent('allowed');
		expect(mockConfigure).toHaveBeenCalledTimes(2);
	});
});
