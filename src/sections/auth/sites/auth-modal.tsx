import React from 'react';
import WebView from '../../../components/webview';
import Button from '../../../components/button';
import Modal from '../../../components/modal';

const AuthModal = ({ site, visible, setVisible }) => {
	let user = undefined;

	const createNewUser = async json => {
		user = await site.collection.database.action(async () => {
			return await site.users.collection.create(user => {
				user.site.set(site);
				user.set(json);
			});
		});
	};

	const updateUser = async json => {
		await site.collection.database.action(async () => {
			user.updateFromJSON(json);
		});
		// close modal
	};

	const handleMessage = event => {
		const data = JSON.parse(event?.data);
		console.log(data);
		if (data.source === 'wcpos') {
			data?.payload?.consumer_key ? updateUser(data.payload) : createNewUser(data.payload);
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
