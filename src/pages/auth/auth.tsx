import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import PageLayout from '../../layout/page';
import Segment, { SegmentGroup } from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import { AuthView } from './styles';
import Site from './site';
import useAppState from '../../hooks/use-app-state';

interface Props {}

const Auth: React.FC<Props> = (props) => {
	const navigation = useNavigation();
	const [{ appUser }] = useAppState();
	const sites = useObservableSuspense(appUser.sitesResource);

	const onConnect = async (url) => {
		const trimUrl = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (trimUrl) {
			const newSite = await appUser.database.action(async () =>
				appUser.sites.collection.create((site) => {
					site.url = `https://${trimUrl}`;
					site.app_user.set(appUser);
				})
			);
			newSite?.connect();
		}
	};

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
					<SegmentGroup style={{ width: 460 }}>
						<Segment content="Sites" />
						{sites.map((site) => (
							<Segment key={site.id}>
								<Site site={site} />
							</Segment>
						))}
					</SegmentGroup>
				)}
			</AuthView>
		</PageLayout>
	);
};

export default Auth;
