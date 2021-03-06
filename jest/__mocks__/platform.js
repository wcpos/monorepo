import { Platform as RNPlatform } from 'react-native';

const Platform = {
	...RNPlatform,
	OS: 'test',
	Version: 123,
	isTesting: true,
	isElectron: false,
	select: (objs) => objs.ios,
};

export default Platform;
