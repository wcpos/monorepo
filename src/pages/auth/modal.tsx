import React from 'react';
import { Platform } from 'react-native';
import Modal from '../../components/modal';
import Button from '../../components/button';
import Url from '../../lib/url-parse';
import WebView from '../../components/webview';

interface Props {
	visible: boolean;
	setVisible: () => void;
	site: typeof import('../../database/models/auth/site');
}

const AuthModal: React.FC<Props> = ({ visible, setVisible, site }) => {
	const returnUrl = Platform.OS === 'web' ? 'https://localhost:3000/auth' : 'wcpos://auth';

	const authUrl =
		site.wc_api_auth_url +
		Url.qs.stringify(
			{
				app_name: 'WooCommerce POS',
				scope: 'read_write',
				user_id: site?.user?.id,
				return_url: returnUrl,
				callback_url: 'https://client.wcpos.com',
				wcpos: 1,
			},
			true
		);

	const handleMessage = (event) => {
		const data = typeof event?.data === 'string' ? JSON.parse(event?.data) : event?.data;

		if (data?.source === 'wcpos') {
			site.createOrUpdateUser(data.payload);
		}
	};

	return (
		<Modal visible={visible}>
			<WebView src={authUrl} onMessage={handleMessage} />
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
