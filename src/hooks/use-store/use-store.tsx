import React from 'react';
import { StoreContext } from './provider';

export const useStore = () => {
	return React.useContext(StoreContext);
};

export default useStore;
