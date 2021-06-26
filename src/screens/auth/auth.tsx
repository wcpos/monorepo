import * as React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Segment from '@wcpos/common/src/components/segment';
import TextInput from '@wcpos/common/src/components/textinput';
import Text from '@wcpos/common/src/components/text';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Site from './site';
import * as Styled from './styles';

type UserDocument = import('@wcpos/common/src/database').UserDocument;

/**
 *
 */
const Auth = () => {
	const { user } = useAppState() as { user: UserDocument };
	const [sites] = useObservableState(user.getSites$, []);

	const onConnect = React.useCallback(
		async (url: string): Promise<void> => {
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
		},
		[user]
	);

	useWhyDidYouUpdate('Auth', { user, sites, onConnect });

	return (
		<Styled.Container>
			<Segment style={{ width: '90%', maxWidth: 460 }}>
				<Text size="large">Connect!</Text>
				<Text>Enter the URL of your WooCommerce store:</Text>
				<TextInput
					label="Connect"
					prefix="https://"
					action="Connect"
					onAction={onConnect}
					type="url"
					clearable
				/>
			</Segment>
			{sites && sites.length > 0 && (
				<Segment.Group style={{ width: '90%', maxWidth: 460, height: 'auto' }}>
					{/* <Segment content="Sites" /> */}
					{sites.map((site) => (
						<Segment key={site._id}>
							<Site site={site} user={user} />
						</Segment>
					))}
				</Segment.Group>
			)}
		</Styled.Container>
	);
};

export default Auth;
