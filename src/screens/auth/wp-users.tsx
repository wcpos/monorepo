import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Box from '@wcpos/common/src/components/box';
import Text from '@wcpos/common/src/components/text';
import Button from '@wcpos/common/src/components/button';
import WpUser from './wp-user';
import Login from './login';

interface WpUserProps {
	site: import('@wcpos/common/src/database').SiteDocument;
}

const WpUsers = ({ site }: WpUserProps) => {
	const [wpCreds] = useObservableState(site.getWpCredentials$, []);
	const loginRef = React.useRef<typeof Login>(null);

	// const open = React.useCallback(() => {
	// 	ref.current?.open();
	// }, []);

	return (
		<>
			<Box horizontal align="center" space="medium">
				<Text>Logged in users</Text>
				<Button
					size="small"
					title="Add new user"
					type="secondary"
					background="outline"
					onPress={loginRef.current?.open}
				/>
			</Box>
			{wpCreds.map((wpCred) => (
				<WpUser key={wpCred.localID} wpUser={wpCred} site={site} />
			))}

			<Login ref={loginRef} site={site} />
		</>
	);
};

export default WpUsers;
