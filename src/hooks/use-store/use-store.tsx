import * as React from 'react';
import DatabaseService from '@wcpos/common/src/database';

export function userStore() {
	const [storeDB, setStoreDB] = React.useState();

	return { storeDB, setStoreDB };
}
