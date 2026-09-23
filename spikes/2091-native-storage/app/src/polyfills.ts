import * as Crypto from 'expo-crypto';

import { getWorkletFs, installWorkletFs } from '@wcpos/react-native-worklet-fs';
import { installWorkletRuntimePolyfills } from '@wcpos/worklet-opfs';
export function installPolyfills() {
	const globals = globalThis as unknown as {
		crypto?: { subtle?: { digest: typeof Crypto.digest } };
		structuredClone?: <T>(value: T) => T;
	};
	globals.crypto ??= {};
	globals.crypto.subtle ??= { digest: Crypto.digest };
	installWorkletFs();
	installWorkletRuntimePolyfills({ fs: getWorkletFs() });
	// The benchmark clones only JSON fixtures; RN Hermes does not expose structuredClone.
	globals.structuredClone ??= <T>(value: T): T => JSON.parse(JSON.stringify(value));
}
