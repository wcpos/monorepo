import * as React from 'react';

export const RestApiContext = React.createContext<any>(null);

interface IRestApiProps {
	children: React.ReactNode;
}

const RestApiProvider = ({ children }: IRestApiProps) => {
	const value = {
		baseUrl: 'https://localhost:8888/wp-json/wc/v3/',
		jwt: '',
	};

	return <RestApiContext.Provider value={value}>{children}</RestApiContext.Provider>;
};

export default RestApiProvider;
