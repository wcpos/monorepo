import React, { createContext, useState, useEffect } from 'react';
import { sitesDatabase as database } from '../../database/';

export const AuthContext = createContext({ site: undefined, user: undefined, store: undefined });

type Props = {
	children: React.ReactNode;
};

/**
 *
 */
const AuthProvider = ({ children }: Props) => {
	const [sites, setSites] = useState([]);
	const [site, setSite] = useState();
	const [user, setUser] = useState();
	const [store, setStore] = useState();

	const logout = () => {
		console.log('logout');
	};

	// bootstrap sites on mount
	useEffect(() => {
		const fetchSites = async () => {
			const sitesCollection = database.collections.get('sites');
			const sites = await sitesCollection.query().fetch();
			setSites(sites);
		};

		fetchSites();
	}, []);

	return (
		<AuthContext.Provider value={{ sites, logout, site, setSite, user, setUser, store, setStore }}>
			{children}
		</AuthContext.Provider>
	);
};

export default AuthProvider;
