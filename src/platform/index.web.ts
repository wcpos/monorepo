import { Platform as RNPlatform } from 'react-native';

type PlatformType = typeof RNPlatform & {
	isElectron: boolean;
	isNative: boolean;
	isStandalone: boolean;
};

const Platform: PlatformType = {
	...RNPlatform,
	isElectron: false,
	isNative: false,
	isStandalone: (window.navigator as any).standalone,
};

export default Platform;
