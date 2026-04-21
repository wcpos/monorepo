import { describe, expect, it } from 'vitest';

import {
	classifyDiscoveryFailure,
	formatDiscoveryFailureMessage,
} from '../discovery/discovery-errors';

describe('discovery-errors', () => {
	it('classifies native module lookup failures distinctly from package-missing failures', () => {
		const nativeFailure = classifyDiscoveryFailure(
			'epson',
			new Error(
				"TurboModuleRegistry.getEnforcing(...): 'EscPosPrinter' could not be found. Verify that a module by this name is registered in the native binary."
			)
		);
		const packageFailure = classifyDiscoveryFailure(
			'star',
			new Error("Unable to resolve module 'react-native-star-io10'")
		);

		expect(nativeFailure.kind).toBe('native-module-missing');
		expect(packageFailure.kind).toBe('package-missing');
	});

	it('classifies unknown errors as scan-failed', () => {
		const failure = classifyDiscoveryFailure('epson', new Error('Connection timeout'));
		expect(failure.kind).toBe('scan-failed');
	});

	it('formats a rebuild message when native printer modules are missing from the binary', () => {
		const message = formatDiscoveryFailureMessage([
			{
				vendor: 'epson',
				kind: 'native-module-missing',
				message: 'EscPosPrinter missing',
			},
		]);

		expect(message).toContain('missing from the native app binary');
		expect(message).toContain('Rebuild the iOS/Android development build');
	});

	it('deduplicates vendor labels in native module rebuild messages', () => {
		const message = formatDiscoveryFailureMessage([
			{ vendor: 'epson', kind: 'native-module-missing', message: 'first' },
			{ vendor: 'epson', kind: 'native-module-missing', message: 'second' },
		]);

		expect(message).toContain('Epson printer discovery');
		expect(message).not.toContain('Epson and Epson');
	});

	it('prefers native-module guidance over package-missing failures in mixed results', () => {
		const message = formatDiscoveryFailureMessage([
			{ vendor: 'epson', kind: 'package-missing', message: 'missing package' },
			{ vendor: 'star', kind: 'native-module-missing', message: 'native binary mismatch' },
		]);

		expect(message).toContain('missing from the native app binary');
		expect(message).toContain('Star printer discovery');
	});

	it('returns the first scan failure message when discovery fails for other reasons', () => {
		const message = formatDiscoveryFailureMessage([
			{ vendor: 'star', kind: 'scan-failed', message: 'Connection timeout' },
		]);

		expect(message).toBe('Star printer discovery failed: Connection timeout');
	});

	it('returns null when no failures were recorded', () => {
		expect(formatDiscoveryFailureMessage([])).toBeNull();
	});
});
