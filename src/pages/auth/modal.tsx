import * as React from 'react';
import { Platform } from 'react-native';
import Modal from '../../components/modal';
import Button from '../../components/button';
import Url from '../../lib/url-parse';
import WebView from '../../components/webview';

interface Props {
	visible: boolean;
	setVisible: (visible: boolean) => void;
	user: any;
	site: any;
}

interface IPayloadProps {
	consumer_key?: string;
	consumer_secret?: string;
}

const AuthModal = ({ visible, setVisible, user, site }: Props): React.ReactElement => {
	const returnUrl = Platform.OS === 'web' ? 'https://localhost:3000/auth' : 'wcpos://auth';
	const [payload, setPayload] = React.useState<IPayloadProps>({});

	if (payload?.consumer_key && payload?.consumer_secret) {
		user.createOrUpdateWpCredentialsBySiteId(site.id, payload);
		setVisible(false);
	}

	const authUrl =
		site.wc_api_auth_url +
		Url.qs.stringify({
			app_name: 'WooCommerce POS',
			scope: 'read_write',
			user_id: user.id,
			return_url: returnUrl,
			callback_url: 'https://client.wcpos.com',
			wcpos: 1,
		});

	const handleMessage = (event: { data: unknown }) => {
		const data = typeof event?.data === 'string' ? JSON.parse(event?.data) : event?.data;
		if (data?.source === 'wcpos') {
			setPayload({ ...payload, ...data.payload });
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
