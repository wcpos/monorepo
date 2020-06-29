import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import PageLayout from '../../layout/page';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import { AuthView } from './styles';
import Site from './site';
import useAppState from '../../hooks/use-app-state';

interface Props {}

const Auth: React.FC<Props> = (props) => {
	const navigation = useNavigation();
	const [{ appUser }] = useAppState();
	// console.log(appUser.getSitesResource());
	const sites = useObservableSuspense(appUser.sitesResource);
	console.log(sites);
	// const sites = [];

	const onConnect = async (url) => {
		appUser.addSite(url);
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

	React.useEffect(() => {
		(async function fetchSites() {
			const site = await appUser.collection.database.collections.sites
				.findOne(appUser.sites[0])
				.exec();
			console.log(site.nameOrUrl);
			debugger;
			// const site = await appUser.sites.find().exec();
			// console.log(sites);
		})();
	}, []);

	return (
		<PageLayout>
			<AuthView>
				<Segment style={{ width: 460 }}>
					<Text size="large">Connect!</Text>
					<Text>Enter the URL of your WooCommerce store:</Text>
					<TextInput
						prefix="https://"
						action="Connect"
						onAction={onConnect}
						keyboardType="url"
						cancellable
					/>
				</Segment>
				{sites.length > 0 && (
					<Segment.Group style={{ width: 460 }}>
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
