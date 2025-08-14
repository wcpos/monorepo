import { PlatformStatic, Platform as RNPlatform } from 'react-native';

interface TestPlatform extends PlatformStatic {
	OS: 'test';
	isTesting: true;
}
type PlatformType = (TestPlatform | typeof RNPlatform) & {
	isElectron: boolean;
	isNative: boolean;
	isWeb: boolean;
};

const Platform: PlatformType = {
	...RNPlatform,
	isElectron: false,
	isNative: true,
	isWeb: false,
};

export default Platform;
