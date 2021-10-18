import { useContext } from 'react';
import { DatabaseContext } from './database-provider';

const useDatabase = () => {
	return useContext(DatabaseContext);
};

export default useDatabase;
