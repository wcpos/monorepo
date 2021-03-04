import { Platform as RNPlatform, PlatformStatic } from 'react-native';

interface TestPlatform extends PlatformStatic {
	OS: 'test';
}
type PlatformType = (TestPlatform | typeof RNPlatform) & { isElectron: boolean };

const Platform: PlatformType = {
	...RNPlatform,
	isElectron: false,
};

export default Platform;
