import { useContext, createContext } from 'react';
import database from '../database';

// import { DatabaseContext } from '@nozbe/watermelondb/DatabaseProvider';

export const DatabaseContext = createContext(database);
export const { Provider, Consumer } = DatabaseContext;

export default function useDatabase() {
	return useContext(DatabaseContext);
}

// import { useDatabase } from '@nozbe/watermelondb/hooks';

// export default useDatabase;
