import * as ReactNative from 'react-native';

export const Platform = {
	...ReactNative.Platform,
	OS: 'test',
	Version: 123,
	isTesting: true,
	select: (objs) => objs.ios,
};

export default Object.setPrototypeOf(
	{
		Platform,
	},
	ReactNative
);
