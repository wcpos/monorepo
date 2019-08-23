import { useContext } from 'react';
import { DatabaseContext } from './';

export const useDatabase = () => {
	return useContext(DatabaseContext);
};

export default useDatabase;
