import { useContext } from 'react';
import { AppStateContext } from './app-state-provider';

type AppState = import('./app-state-provider').AppState;
type AppAction = import('./app-state-provider').AppAction;

const useAppState = (): [AppState, React.Dispatch<AppAction>] => {
	return useContext(AppStateContext);
};

export default useAppState;
