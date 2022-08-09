import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { useNavigation } from '@react-navigation/native';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import Button from '@wcpos/components/src/button';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import WpUser from './wp-user';

interface WpUserProps {
	site: import('@wcpos/database').SiteDocument;
}

const WpUsers = ({ site }: WpUserProps) => {
	const wpCreds = useObservableSuspense(site.wpCredentialsResource);
	const navigation = useNavigation();

	return (
		<>
			<Box horizontal align="center" space="medium">
				<Text>Logged in users</Text>
				<Button
					size="small"
					title="Add new user"
					type="secondary"
					background="outline"
					onPress={() => navigation.navigate('Login', { siteID: site.localID })}
				/>
			</Box>
			{Array.isArray(wpCreds) &&
				wpCreds.length > 0 &&
				wpCreds.map((wpCred) => (
					<ErrorBoundary key={wpCred.localID}>
						<React.Suspense>
							<WpUser wpUser={wpCred} site={site} />
						</React.Suspense>
					</ErrorBoundary>
				))}
		</>
	);
};

export default WpUsers;
