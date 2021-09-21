import * as React from 'react';
import { isRxDatabase } from 'rxdb/plugins/core';
import DatabaseService from '@wcpos/common/src/database';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

export const StoreDBContext = React.createContext<any>(null);

interface IStoreDBProviderProps {
	children: React.ReactNode;
	id?: string;
}

const StoreDBProvider = ({ children, id = 'foo' }: IStoreDBProviderProps) => {
	const [storeDB, setStoreDB] = React.useState<StoreDatabase>();

	React.useEffect(() => {
		async function getStoreDB() {
			const db = await DatabaseService.getStoreDB(id);
			if (isRxDatabase(db)) {
				setStoreDB(db);
			}
		}

		if (id) {
			getStoreDB();
		}
	}, [id]);

	return (
		<StoreDBContext.Provider value={{ storeDB, setStoreDB }}>{children}</StoreDBContext.Provider>
	);
};

export default StoreDBProvider;
