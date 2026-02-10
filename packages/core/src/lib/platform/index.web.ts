import { Platform as RNPlatform } from 'react-native';

type PlatformType = typeof RNPlatform & {
	isElectron: boolean;
	isStandalone: boolean;
};

function isElectron() {
	// https://github.com/cheton/is-electron
	return false;
}

const Platform: PlatformType = {
	...RNPlatform,
	isElectron: isElectron(),
	isStandalone: (globalThis.navigator as any).standalone,
};

export { Platform };
