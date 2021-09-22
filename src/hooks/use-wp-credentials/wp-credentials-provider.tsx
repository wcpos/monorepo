import * as React from 'react';
import DatabaseService from '@wcpos/common/src/database';

type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

interface WpCredentialsContextProps {
	wpCredentials?: WPCredentialsDocument;
	setWpCredentials: React.Dispatch<React.SetStateAction<WPCredentialsDocument | undefined>>;
}

export const WpCredentialsContext = React.createContext<WpCredentialsContextProps | null>(null);

interface IStoreDBProviderProps {
	children: React.ReactNode;
}

const WpCredentialsProvider = ({ children }: IStoreDBProviderProps) => {
	const [wpCredentials, setWpCredentials] = React.useState<WPCredentialsDocument | undefined>();

	// React.useEffect(() => {
	// 	async function getLastUser() {
	// 		const userDB = await DatabaseService.getUserDB();
	// 	}

	// 	getLastUser();
	// }, []);

	return (
		<WpCredentialsContext.Provider value={{ wpCredentials, setWpCredentials }}>
			{children}
		</WpCredentialsContext.Provider>
	);
};

export default WpCredentialsProvider;
