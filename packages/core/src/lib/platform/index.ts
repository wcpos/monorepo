import { Platform as RNPlatform } from 'react-native';

type TestPlatform = Omit<typeof RNPlatform, 'OS' | 'isTesting'> & {
	OS: 'test';
	isTesting: true;
};
type PlatformType = (TestPlatform | typeof RNPlatform) & { isElectron: boolean; isNative: boolean };

const Platform: PlatformType = {
	...RNPlatform,
	isElectron: false,
	isNative: true,
};

export { Platform };
