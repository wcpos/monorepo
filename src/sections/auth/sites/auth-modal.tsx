import React from 'react';
import WebView from '../../../components/webview';
import Button from '../../../components/button';
import Modal from '../../../components/modal';

const AuthModal = ({ site, visible, setVisible }) => {
	const [user, setUser] = React.useState();

	const getUser = async json => {
		let user = await site.fetchUserByRemoteId(json.remote_id);
		if (!user) {
			user = await site.collection.database.action(async () => {
				return await site.users.collection.create(user => {
					user.site.set(site);
					user.set(json);
				});
			});
		}
		return user;
	};

	const updateUser = async json => {
		if (!user) {
			const u = await getUser(json);
			setUser(u);
		} else {
			await site.collection.database.action(async () => {
				user.updateFromJSON(json);
			});
		}
		// close modal
	};

	const handleMessage = event => {
		const data = typeof event?.data === 'string' ? JSON.parse(event?.data) : event?.data;

		if (data?.source === 'wcpos') {
			updateUser(data.payload);
		}
	};

	return (
		<Modal visible={visible}>
			<WebView src={site.wc_api_auth_url} onMessage={handleMessage} />
			<Button
				title="Close Modal"
				onPress={() => {
					setVisible(false);
				}}
			/>
		</Modal>
	);
};

export default AuthModal;
