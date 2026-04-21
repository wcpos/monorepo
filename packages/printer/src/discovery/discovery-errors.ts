export type NativeDiscoveryVendor = 'epson' | 'star';

export type DiscoveryFailureKind = 'package-missing' | 'native-module-missing' | 'scan-failed';

export interface DiscoveryFailure {
	vendor: NativeDiscoveryVendor;
	kind: DiscoveryFailureKind;
	message: string;
}

function stringifyError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export function classifyDiscoveryFailure(
	vendor: NativeDiscoveryVendor,
	error: unknown
): DiscoveryFailure {
	const message = stringifyError(error);
	const normalized = message.toLowerCase();

	if (
		normalized.includes('cannot find module') ||
		normalized.includes('module not found') ||
		normalized.includes('unable to resolve module')
	) {
		return {
			vendor,
			kind: 'package-missing',
			message,
		};
	}

	if (
		normalized.includes('turbomoduleregistry.getenforcing') ||
		normalized.includes('could not be found') ||
		normalized.includes('nativeeventemitter') ||
		normalized.includes('requires a non-null argument')
	) {
		return {
			vendor,
			kind: 'native-module-missing',
			message,
		};
	}

	return {
		vendor,
		kind: 'scan-failed',
		message,
	};
}

export function formatDiscoveryFailureMessage(failures: DiscoveryFailure[]): string | null {
	const packageMissing = failures.filter((failure) => failure.kind === 'package-missing');
	const nativeMissing = failures.filter((failure) => failure.kind === 'native-module-missing');
	const scanFailed = failures.filter((failure) => failure.kind === 'scan-failed');

	if (nativeMissing.length > 0) {
		const vendors = nativeMissing
			.map((failure) => (failure.vendor === 'epson' ? 'Epson' : 'Star'))
			.join(' and ');

		return `${vendors} printer discovery is installed in JavaScript but missing from the native app binary. Rebuild the iOS/Android development build after installing native printer SDKs.`;
	}

	if (packageMissing.length === failures.length && failures.length > 0) {
		return 'No printer SDKs available. Install react-native-esc-pos-printer or react-native-star-io10 for automatic discovery.';
	}

	if (scanFailed.length > 0) {
		const vendor = scanFailed[0]?.vendor === 'epson' ? 'Epson' : 'Star';
		return `${vendor} printer discovery failed: ${scanFailed[0]?.message ?? 'Unknown error'}`;
	}

	return null;
}
