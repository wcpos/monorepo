import * as React from 'react';
import { Platform } from 'react-native';
import Modal from '@wcpos/common/src/components/modal';
import Button from '@wcpos/common/src/components/button';
import Url from '@wcpos/common/src/lib/url-parse';
import WebView from '@wcpos/common/src/components/webview';

type UserDocument = import('@wcpos/common/src/database/users').UserDocument;
type SiteDocument = import('@wcpos/common/src/database/sites').SiteDocument;

interface IAuthModalProps {
	visible: boolean;
	setVisible: (visible: boolean) => void;
	site: SiteDocument;
	user: UserDocument;
}

interface IPayloadProps {
	consumer_key?: string;
	consumer_secret?: string;
}

const AuthModal = ({ visible, setVisible, site, user }: IAuthModalProps) => {
	const returnUrl = Platform.OS === 'web' ? 'https://localhost:3000/auth' : 'wcpos://auth';
	const [payload, setPayload] = React.useState<IPayloadProps>({});

	if (payload?.consumer_key && payload?.consumer_secret) {
		debugger;
		setVisible(false);
	}
	console.log(site);
	const authUrl =
		site.wcApiAuthUrl +
		Url.qs.stringify(
			{
				app_name: 'WooCommerce POS',
				scope: 'read_write',
				user_id: user._id,
				return_url: returnUrl,
				callback_url: 'https://client.wcpos.com',
				wcpos: 1,
			},
			// @ts-ignore
			true
		);

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
