import * as Sentry from '@sentry/react-native';
import { File } from 'expo-file-system';

jest.mock('@sentry/react-native', () => ({
	init: jest.fn(),
	close: jest.fn().mockResolvedValue(true),
	setUser: jest.fn(),
	captureException: jest.fn(),
	captureMessage: jest.fn(),
}));
jest.mock('../app-info', () => ({
	AppInfo: { version: '1.10.3', buildNumber: '42', platform: 'ios', scheme: 'wcpos' },
}));
const files = new Map<string, string>();
jest.mock('expo-file-system', () => ({
	Paths: { document: 'file:///documents' },
	File: jest.fn().mockImplementation((directory: string, name: string) => {
		const path = `${directory}/${name}`;
		return {
			get exists() {
				return files.has(path);
			},
			textSync: () => files.get(path),
			write: (value: string) => files.set(path, value),
			delete: () => files.delete(path),
		};
	}),
}));
const testGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
testGlobal.__DEV__ = false;
Object.defineProperty(globalThis, 'crypto', {
	configurable: true,
	value: { randomUUID: () => 'e49735e4-34af-4abd-a8f6-78f17b350a82' },
});
const { setTelemetryConsent, captureLoggedError, capturePrinterOutcome } =
	jest.requireActual<typeof import('./sentry-sink.native')>('./sentry-sink.native');
const initCallsOnImport = jest.mocked(Sentry.init).mock.calls.length;
const installIdPath = 'file:///documents/wcpos_install_id';
const consentMarkerPath = 'file:///documents/wcpos_telemetry_consent';

describe('sentry-sink.native', () => {
	beforeEach(() => {
		setTelemetryConsent('undecided');
		files.clear();
		jest.clearAllMocks();
	});

	it('does not initialize or capture before consent', () => {
		expect(initCallsOnImport).toBe(0);
		captureLoggedError({ message: 'Checkout failed' });
		capturePrinterOutcome({ result: 'success' });
		expect(Sentry.init).not.toHaveBeenCalled();
		expect(Sentry.captureMessage).not.toHaveBeenCalled();
		expect(Sentry.captureException).not.toHaveBeenCalled();
		expect(File).not.toHaveBeenCalled();
	});

	it.each(['ios', 'android'])('initializes once with native metadata for %s', (platform) => {
		jest.requireMock('../app-info').AppInfo.platform = platform;
		setTelemetryConsent('allowed');
		setTelemetryConsent('allowed');
		expect(Sentry.init).toHaveBeenCalledTimes(1);
		expect(Sentry.init).toHaveBeenCalledWith(
			expect.objectContaining({
				dsn: 'https://39233e9d1e5046cbb67dae52f807de5f@o159038.ingest.sentry.io/1220733',
				environment: platform,
				sendDefaultPii: false,
				enableWatchdogTerminationTracking: true,
				beforeSend: expect.any(Function),
			})
		);
		const initOptions = jest.mocked(Sentry.init).mock.calls[0]?.[0];
		expect(initOptions?.enabled).not.toBe(false);
		// The SDK's derived `<applicationId>@<version>+<build>` is the key the native
		// upload steps file symbols under; a custom release here would never match.
		expect(initOptions?.release).toBeUndefined();
		expect(initOptions?.dist).toBeUndefined();
		expect(files.get(installIdPath)).toBe('e49735e4-34af-4abd-a8f6-78f17b350a82');
		expect(Sentry.setUser).toHaveBeenCalledWith({ id: files.get(installIdPath) });
	});

	it('reuses a persisted install id', () => {
		files.set(installIdPath, 'existing-install-id');
		setTelemetryConsent('allowed');
		expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'existing-install-id' });
	});

	it('persists allowed consent and forgets it on anything else', () => {
		setTelemetryConsent('allowed');
		expect(files.get(consentMarkerPath)).toBe('allowed');
		setTelemetryConsent('denied');
		expect(files.has(consentMarkerPath)).toBe(false);
		setTelemetryConsent('allowed');
		setTelemetryConsent('undecided');
		expect(files.has(consentMarkerPath)).toBe(false);
	});

	it('initializes at import for an install that already allowed reporting', () => {
		files.set(consentMarkerPath, 'allowed');
		files.set(installIdPath, 'existing-install-id');
		jest.isolateModules(() => {
			jest.requireActual<typeof import('./sentry-sink.native')>('./sentry-sink.native');
			const isolated = jest.requireMock('@sentry/react-native');
			expect(isolated.init).toHaveBeenCalledTimes(1);
			expect(isolated.setUser).toHaveBeenCalledWith({ id: 'existing-install-id' });
		});
	});

	it('retries after persisted-consent initialization fails during startup', () => {
		files.set(consentMarkerPath, 'allowed');
		jest.mocked(Sentry.init).mockImplementationOnce(() => {
			throw new Error('native initialization failed');
		});

		jest.isolateModules(() => {
			const isolated =
				jest.requireActual<typeof import('./sentry-sink.native')>('./sentry-sink.native');
			expect(Sentry.init).toHaveBeenCalledTimes(1);

			isolated.setTelemetryConsent('allowed');
			expect(Sentry.init).toHaveBeenCalledTimes(2);
		});
	});

	it.each(['denied', 'undecided'] as const)('closes and stops captures on %s', (consent) => {
		setTelemetryConsent('allowed');
		setTelemetryConsent(consent);
		captureLoggedError({ message: 'Checkout failed' });
		capturePrinterOutcome({ result: 'success' });
		expect(Sentry.close).toHaveBeenCalledTimes(1);
		expect(Sentry.captureMessage).not.toHaveBeenCalled();
		expect(files.has(installIdPath)).toBe(consent !== 'denied');
	});

	it('deletes a previous install id even when denied before init', () => {
		files.set(installIdPath, 'existing-install-id');
		setTelemetryConsent('denied');
		expect(files.has(installIdPath)).toBe(false);
		expect(Sentry.init).not.toHaveBeenCalled();
	});

	it('captures exceptions and messages with the shared grouping', () => {
		setTelemetryConsent('allowed');
		const error = new Error('Order 42 failed');
		captureLoggedError({ message: error.message, code: 'ORDER999', context: { error } });
		expect(Sentry.captureException).toHaveBeenCalledWith(
			error,
			expect.objectContaining({
				fingerprint: ['ORDER999', 'Order {} failed'],
				level: 'error',
			})
		);
		captureLoggedError({ message: 'Checkout failed' });
		expect(Sentry.captureMessage).toHaveBeenCalledWith(
			'Checkout failed',
			expect.objectContaining({ level: 'error' })
		);
	});

	it('only sends address-free printer outcome fields', () => {
		setTelemetryConsent('allowed');
		capturePrinterOutcome({ result: 'success', columns: 42, address: '192.168.1.1' });
		expect(Sentry.captureMessage).toHaveBeenCalledWith('Printer setup outcome', {
			level: 'info',
			tags: { result: 'success', columns: '42' },
			extra: { context: { result: 'success', columns: '42' } },
		});
	});

	it('never throws SDK capture failures into the logger', () => {
		setTelemetryConsent('allowed');
		jest.mocked(Sentry.captureException).mockImplementationOnce(() => {
			throw new Error('SDK');
		});
		jest.mocked(Sentry.captureMessage).mockImplementation(() => {
			throw new Error('SDK');
		});
		expect(() =>
			captureLoggedError({ message: 'Failed', context: { error: new Error() } })
		).not.toThrow();
		expect(() => captureLoggedError({ message: 'Failed' })).not.toThrow();
		expect(() => capturePrinterOutcome({ result: 'success' })).not.toThrow();
		jest.mocked(Sentry.captureMessage).mockReset();
	});

	it('does not initialize in development even with consent', () => {
		testGlobal.__DEV__ = true;
		jest.isolateModules(() => {
			jest
				.requireActual<typeof import('./sentry-sink.native')>('./sentry-sink.native')
				.setTelemetryConsent('allowed');
			expect(jest.requireMock('@sentry/react-native').init).not.toHaveBeenCalled();
		});
		testGlobal.__DEV__ = false;
	});

	it.each(['wcpos-dev', 'wcpos-adhoc'])(
		'does not report from the %s binary even with consent',
		(scheme) => {
			jest.requireMock('../app-info').AppInfo.scheme = scheme;
			files.set(consentMarkerPath, 'allowed');
			jest.isolateModules(() => {
				jest
					.requireActual<typeof import('./sentry-sink.native')>('./sentry-sink.native')
					.setTelemetryConsent('allowed');
				expect(jest.requireMock('@sentry/react-native').init).not.toHaveBeenCalled();
			});
			jest.requireMock('../app-info').AppInfo.scheme = 'wcpos';
		}
	);
});
