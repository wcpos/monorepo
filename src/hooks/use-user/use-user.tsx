import React from 'react';
import { UserContext } from './provider';

export const useUser = () => {
	return React.useContext(UserContext);
};

export default useUser;
