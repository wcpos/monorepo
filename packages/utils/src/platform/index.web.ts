import { Platform as RNPlatform } from 'react-native';

type PlatformType = typeof RNPlatform & {
	isElectron: boolean;
	isNative: boolean;
	isTauri: boolean;
	isStandalone: boolean;
};

const Platform: PlatformType = {
	...RNPlatform,
	isElectron: false,
	isNative: false,
	isTauri: !!window.__TAURI__,
	isStandalone: (window.navigator as any).standalone,
};

export default Platform;
