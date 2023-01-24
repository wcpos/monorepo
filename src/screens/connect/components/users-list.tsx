import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableSuspense } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import User from './user';
import { t } from '../../../lib/translations';

interface WpUserProps {
	site: import('@wcpos/database').SiteDocument;
}

const UsersList = ({ site }: WpUserProps) => {
	const wpCreds = useObservableSuspense(site.wpCredentialsResource);
	const navigation = useNavigation();

	return (
		<>
			<Box horizontal align="center" space="medium">
				<Text>{t('Logged in users', { _tags: 'core' })}</Text>
				<Button
					size="small"
					title={t('Add new user', { _tags: 'core' })}
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
							<User wpUser={wpCred} site={site} />
						</React.Suspense>
					</ErrorBoundary>
				))}
		</>
	);
};

export default UsersList;
