import { Platform as RNPlatform } from 'react-native';

type PlatformType = typeof RNPlatform & {
	isElectron: boolean;
	isNative: boolean;
	isWeb: boolean;
	isStandalone: boolean;
};

const Platform: PlatformType = {
	...RNPlatform,
	isElectron: false,
	isNative: false,
	isWeb: true,
	isStandalone: (window.navigator as any).standalone,
};

export { Platform };
