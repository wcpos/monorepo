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
});
