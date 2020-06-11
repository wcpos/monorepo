import React from 'react';
import { Text } from 'react-native';
import { ThemeProvider } from 'styled-components/native';
import NetInfo from '@react-native-community/netinfo';
import { DatabaseProvider } from './hooks/use-database';
import Navigator from './navigators';
import Portal from './components/portal';
import { defaultTheme } from './lib/theme';
import ErrorBoundary from './components/error';

// import i18n
import i18n from './lib/i18n';

const initialState = {
	online: false,
};

type AppState = typeof initialState;

const IS_OFFLINE = 'root.IS_OFFLINE';
const IS_ONLINE = 'root.IS_ONLINE';

function appStateReducer(state: AppState, action): AppState {
	switch (action.type) {
		// case REQUEST_DESKTOP:
		// 	return { ...state, showingDesktop: true, showingMobile: false };
		// case REQUEST_MOBILE:
		// 	return { ...state, showingDesktop: false, showingMobile: true };
		// case URL_SYNC:
		// 	return { ...state, module: getCurrentModuleFromUrl(), urlState: getCurrentUrlState() };
		case IS_OFFLINE:
			return { ...state, online: false };
		case IS_ONLINE:
			return { ...state, online: true };
		// case SET_THEME:
		// 	return { ...state, colorTheme: action.theme };
		default:
			return state;
	}
}

export const AppContext = React.createContext<[AppState, any]>(null);

function useAppState(): [AppState, any] {
	const [state, dispatch] = React.useReducer(appStateReducer, initialState);
	const result = React.useMemo(() => [state, dispatch], [state]) as any;
	return result;
}

const App = () => {
	const appStatePacket = useAppState();
	const [appState, dispatch] = appStatePacket;

	console.warn('hi');
	React.useEffect(() => {
		return NetInfo.addEventListener((state) => {
			return state.isConnected ? dispatch({ type: IS_ONLINE }) : dispatch({ type: IS_OFFLINE });
			// console.log(state);
			// console.log('Connection type', state.type);
			// console.log('Is connected?', state.isConnected);
		});
	}, [dispatch]);

	// <React.StrictMode>
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>loading app...</Text>}>
				<AppContext.Provider value={appStatePacket}>
					<DatabaseProvider>
						<ThemeProvider theme={defaultTheme}>
							<Portal.Host>
								<Navigator />
							</Portal.Host>
						</ThemeProvider>
					</DatabaseProvider>
				</AppContext.Provider>
			</React.Suspense>
		</ErrorBoundary>
	);
	// </React.StrictMode>
};

export default App;
