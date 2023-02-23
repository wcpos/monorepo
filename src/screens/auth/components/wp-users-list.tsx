import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableSuspense } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import WPUser from './wp-user';
import { t } from '../../../lib/translations';

interface WpUserProps {
	site: import('@wcpos/database').SiteDocument;
}

const WPUsersList = ({ wpUsersResource, site }: WpUserProps) => {
	const wpCreds = useObservableSuspense(wpUsersResource);
	const navigation = useNavigation();

	return (
		<Box space="xSmall">
			<Box horizontal align="center" space="medium">
				<Text>{t('Logged in users', { _tags: 'core' })}</Text>
				<Button
					size="small"
					title={t('Add new user', { _tags: 'core' })}
					type="secondary"
					background="outline"
					onPress={() => navigation.navigate('Login', { siteID: site.uuid })}
				/>
			</Box>
			{wpCreds.map((wpCred) => (
				<ErrorBoundary key={wpCred.uuid}>
					<React.Suspense>
						<WPUser wpUser={wpCred} site={site} />
					</React.Suspense>
				</ErrorBoundary>
			))}
		</Box>
	);
};

export default WPUsersList;
