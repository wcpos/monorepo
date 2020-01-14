import React from 'react';
import { sitesDatabase } from '../../database/';

export const useLastUser = () => {
	const [lastUser, _setLastUser] = React.useState();

	// fetch last user hash on init
	React.useEffect(() => {
		const getLastHash = async () => {
			const lastUser = await sitesDatabase.adapter.getLocal('last_user');
			console.log('Fetch last user: ' + lastUser);

			if (lastUser) {
				_setLastUser(JSON.parse(lastUser));
			} else {
				_setLastUser({});
			}
		};

		getLastHash();
	}, []);

	const setLastUser = async (obj: {}) => {
		_setLastUser(obj);
		await sitesDatabase.adapter.setLocal('last_user', JSON.stringify(obj));
	};

	console.log('Last user updated: ', lastUser);
	return [lastUser, setLastUser];
};

export default useLastUser;
