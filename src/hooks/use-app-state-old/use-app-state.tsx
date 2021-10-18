import { useContext } from 'react';
import { AppStateContext } from './app-state-provider';

const useAppState = () => {
	return useContext(AppStateContext);
};

export default useAppState;
