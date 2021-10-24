import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Segment from '@wcpos/common/src/components/segment';
import TextInput from '@wcpos/common/src/components/textinput';
import Text from '@wcpos/common/src/components/text';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import http from '@wcpos/common/src/lib/http';
import Platform from '@wcpos/common/src/lib/platform';
import Url from '@wcpos/common/src/lib/url-parse';
import get from 'lodash/get';
import find from 'lodash/find';
import Site from './site';
import * as Styled from './styles';

type UserDocument = import('@wcpos/common/src/database').UserDocument;
type SiteDocument = import('@wcpos/common/src/database').SiteDocument;

const parseApiUrlFromHeaders = (headers: { link: string }) => {
	const link = headers?.link;
	// @ts-ignore
	const parsed = Url.parseLinkHeader(link);
	return parsed?.['https://api.w.org/']?.url;
};

/**
 *
 */
const Auth = () => {
	const { user, userDB } = useAppState();
	// @TODO - calling getSites$() resubscribes every render
	const [sites] = useObservableState(user.getSites$, []);

	const onConnect = React.useCallback(
		async (url: string): Promise<void> => {
			// first get siteData
			let protocol = 'https';
			if (Platform.OS === 'web' && process.env.NODE_ENV === 'development') {
				protocol = 'http';
			}

			const urlWithoutProtocol = url.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';

			const siteData = await http
				.head(`${protocol}://${urlWithoutProtocol}`)
				.then((response) => {
					// @ts-ignore
					const wpApiUrl = parseApiUrlFromHeaders(response.headers);
					if (wpApiUrl) {
						const wcNamespace = 'wc/v3';
						const wcposNamespace = 'wcpos/v1';

						return http.get(wpApiUrl).then((res) => {
							const data = get(res, 'data') as Record<string, any>;
							const namespaces: string[] = get(data, 'namespaces', []);
							if (!namespaces.includes(wcNamespace)) {
								throw Error('WooCommerce API not found');
							} else if (!namespaces.includes(wcposNamespace)) {
								throw Error('WooCommerce POS API not found');
							}
							return {
								...data,
								wpApiUrl,
								wcApiUrl: `${wpApiUrl}wc/v3`,
								wcApiAuthUrl: `${wpApiUrl}wcpos/v1/jwt`,
							};
						});
					}
					throw Error('Site does not seem to be a WordPress site');
				})
				.catch((err) => {
					// useErrorModal?
					console.error(err);
				});

			if (siteData) {
				// check against database
				// populate user sites
				// const s = await user.populate('sites').catch((err) => {
				// 	console.error(err);
				// });
				// @ts-ignore
				const existingSite = find(sites, { url: siteData?.url });

				// if not existingSite, then insert site data
				if (!existingSite) {
					// @ts-ignore
					const newSite = await userDB.sites.insert(siteData); // note: insertApiData

					user.update({ $push: { sites: newSite?.localID } }).catch((err) => {
						console.log(err);
						return err;
					});
				} else {
					debugger;
				}
			}
		},
		[user, userDB]
	);

	// useWhyDidYouUpdate('Auth', { user, sites, onConnect });

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
					hideLabel
				/>
			</Segment>
			{sites && sites.length > 0 && (
				<Segment.Group style={{ width: '90%', maxWidth: 460, height: 'auto' }}>
					{/* <Segment content="Sites" /> */}
					{sites.map((site) => (
						<Segment key={site.localID}>
							<Site site={site} user={user} />
						</Segment>
					))}
				</Segment.Group>
			)}
		</Styled.Container>
	);
};

export default Auth;
