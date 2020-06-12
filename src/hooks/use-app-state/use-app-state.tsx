import { useContext } from 'react';
import { AppStateContext } from './app-state-provider';

type AppState = import('./app-state-provider').AppState;
type AppAction = import('./app-state-provider').AppAction;
type ActionTypes = import('./app-state-provider').ActionTypes;

const useAppState = (): [AppState, React.Dispatch<AppAction>, ActionTypes] => {
	return useContext(AppStateContext);
};

export default useAppState;
