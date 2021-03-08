import * as React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import PageLayout from '../../layout/page';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import { AuthView } from './styles';
import Site from './site';
import useAppState from '../../hooks/use-app-state';

/**
 *
 */
const Auth = () => {
	const [{ user }] = useAppState();
	const [sites] = useObservableState(user.getSites_$);

	const onConnect = async (url: string): Promise<void> => {
		const newSiteId = await user.addSiteByUrl(url);
		// if (newSiteId) {
		// 	user.connectSite(newSiteId);
		// }
		// const trimUrl = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		// if (trimUrl) {
		// 	const newSite = await appUser.database.action(async () =>
		// 		appUser.sites.collection.create((site) => {
		// 			site.url = `https://${trimUrl}`;
		// 			site.app_user.set(appUser);
		// 		})
		// 	);
		// 	newSite?.connect();
		// }
	};

	return (
		<PageLayout>
			<AuthView>
				<Segment style={{ width: '90%', maxWidth: 460 }}>
					<Text size="large">Connect!</Text>
					<Text>Enter the URL of your WooCommerce store:</Text>
					<TextInput
						prefix="https://"
						action="Connect"
						onAction={onConnect}
						keyboardType="url"
						clearable
					/>
				</Segment>
				{sites && sites.length > 0 && (
					<Segment.Group style={{ width: '90%', maxWidth: 460, height: 'auto' }}>
						<Segment content="Sites" />
						{sites.map((site) => (
							<Segment key={site.id}>
								<Site site={site} />
							</Segment>
						))}
					</Segment.Group>
				)}
			</AuthView>
		</PageLayout>
	);
};

export default Auth;
