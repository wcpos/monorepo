import * as React from 'react';
import { isRxDocument } from 'rxdb/plugins/core';
import getTheme from '@wcpos/common/src/themes';
import useScreenSize from '../use-screen-size';
import useOnline from '../use-online';
import useUser from '../use-user';
import { getUniqueId, getReadableVersion } from './device-info';
import useStoreDB from '../use-store';

type UserDocument = import('@wcpos/common/src/database/users').UserDocument;
type UserDatabase = import('@wcpos/common/src/database').UserDatabase;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

export interface IAppStateProps {
	info: {
		uniqueId: string;
		version: string;
	};
	online: boolean;
	screen: import('react-native').ScaledSize;
	user?: UserDocument;
	setUser: React.Dispatch<React.SetStateAction<UserDocument | undefined>>;
	userDB?: UserDatabase;
	storeDB?: StoreDatabase;
	setStoreDB: (id?: string) => Promise<void>;
}

export const AppStateContext = React.createContext<unknown>({}) as React.Context<IAppStateProps>;

const info = {
	uniqueId: getUniqueId(),
	version: getReadableVersion(),
};

interface IAppStatePropviderProps {
	children: any;
	i18n: any;
}
/**
 * App State Provider
 * Hydrates static or non-frequent state for the app
 */
const AppStateProvider = ({ children, i18n }: IAppStatePropviderProps) => {
	// const [isReady, setIsReady] = React.useState(false);
	const screen = useScreenSize();
	const online = useOnline();
	const { user, setUser, userDB } = useUser();
	const theme = getTheme('default', 'dark');
	const { storeDB, setStoreDB } = useStoreDB();

	const value = {
		info,
		online,
		screen,
		user,
		setUser,
		userDB,
		storeDB,
		setStoreDB,
	};
	console.log(value);

	return (
		<AppStateContext.Provider value={value}>
			{children(isRxDocument(user), theme)}
		</AppStateContext.Provider>
	);
};

export default AppStateProvider;
