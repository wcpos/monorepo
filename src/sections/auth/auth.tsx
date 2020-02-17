import React from 'react';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import { AuthView } from './styles';
import useObservable from '../../hooks/use-observable';
import Sites from './sites';
import { sitesDatabase } from '../../database';

const Auth = () => {
	const collection = sitesDatabase.collections.get('sites');
	const sites = useObservable(collection.query().observe(), []);

	const createNewSite = async url => {
		const trimUrl = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (trimUrl) {
			await sitesDatabase.action(async () => {
				return await collection.create(site => {
					site.url = 'https://' + trimUrl;
				});
			});
		}
	};

	return (
		<AuthView>
			<Segment style={{ width: 460 }}>
				<Text size="large">Connect</Text>
				<Text>Enter the URL of your WooCommerce store:</Text>
				<TextInput
					prefix="https://"
					action="Connect"
					onAction={createNewSite}
					keyboardType="url"
					cancellable={true}
				/>
			</Segment>
			{sites.length > 0 && <Sites sites={sites} />}
		</AuthView>
	);
};

export default Auth;
