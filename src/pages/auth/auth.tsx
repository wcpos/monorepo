import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import PageLayout from '../../layout/page';
import Segment, { SegmentGroup } from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import { AuthView } from './styles';
import Site from './site';
import useDatabase from '../../hooks/use-database';

interface Props {}

const Auth: React.FC<Props> = (props) => {
	const navigation = useNavigation();
	const { user } = useDatabase();
	const sitesResource = new ObservableResource(user.sites.observe());
	const sites = useObservableSuspense(sitesResource);
	console.log(user);

	React.useEffect(() => {
		const unsubscribe = navigation.addListener('state', () => {
			console.log('close modal?');
		});

		return unsubscribe;
	}, [navigation]);

	const onConnect = async (url) => {
		const trimUrl = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (trimUrl) {
			const newSite = await user.database.action(
				async () =>
					await user.sites.collection.create((site) => {
						site.url = `https://${trimUrl}`;
						site.user.set(user);
					})
			);
			newSite?.connect();
		}
	};

	return (
		<PageLayout>
			<AuthView>
				<Segment style={{ width: 460 }}>
					<Text size="large">Connect</Text>
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
