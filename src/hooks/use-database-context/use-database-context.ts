import React from 'react';
import { DatabaseContext } from './database-provider';

export const useDatabaseContext = () => {
	return React.useContext(DatabaseContext);
};

export default useDatabaseContext;
