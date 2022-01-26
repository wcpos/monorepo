import { connectToDevTools } from 'react-devtools-core';

if (__DEV__) {
	connectToDevTools({
		host: 'localhost',
		port: 8097,
	});
}

export { default } from '@wcpos/common/src/app';
