import React from 'react';
import { useNavigation } from '@react-navigation/native';
import PageLayout from '../../layout/page';
import Segment, { SegmentGroup } from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import { AuthView } from './styles';
import useSites from '../../hooks/use-sites';
import Site from './site';

interface Props {}

const Auth: React.FC<Props> = (props) => {
	const navigation = useNavigation();
	const { sites, create } = useSites();
	console.log(sites);

	React.useEffect(() => {
		const unsubscribe = navigation.addListener('state', () => {
			console.log('close modal?');
		});

		return unsubscribe;
	}, [navigation]);

	const onConnect = async (url) => {
		const newSite = await create(url);
		if (newSite) {
			newSite.connect();
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
						cancellable={true}
					/>
				</Segment>
				{sites.length > 0 && (
					<SegmentGroup style={{ width: 460 }}>
						<Segment content="Sites"></Segment>
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
