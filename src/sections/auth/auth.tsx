import React from 'react';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import { AuthView } from './styles';
import useSites from '../../hooks/use-sites';
// import useObservable from '../../hooks/use-observable';
import Icon from '../../components/icon';
import Sites from './sites';
// import { sitesDatabase } from '../../database';

const Connection = ({
	status = 'loading',
	message = 'Loading',
}: {
	status: 'loading' | 'success' | 'error';
	message: string;
}) => (
	<>
		<Icon name={status} /> <Text>{message}</Text>
	</>
);

const Auth = ({ navigation }) => {
	const [sites$, connectNewSite] = useSites();

	return (
		<AuthView>
			<Segment style={{ width: 460 }}>
				<Text size="large">Connect</Text>
				<Text>Enter the URL of your WooCommerce store:</Text>
				<TextInput
					prefix="https://"
					action="Connect"
					onAction={connectNewSite}
					keyboardType="url"
					cancellable={true}
				/>
			</Segment>
			{sites$ && sites$.length > 0 && <Sites sites={sites$} />}
		</AuthView>
	);
};

export default Auth;
