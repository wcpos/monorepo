import React from 'react';
import { ListItem } from '../../components/list';
import Button from '../../components/button';
import Avatar from '../../components/avatar';
import useNavigation from '../../hooks/use-navigation';

type Props = {
	site: typeof import('../../store/models/site');
};

const Site = ({ site }: Props) => {
	const navigation = useNavigation();

	const handleRemove = () => {
		site.destroyPermanently();
	};

	const handlePress = () => {
		site.api.connect().then(() => {
			navigation.navigate('Modal', { site });
		});
	};

	return (
		site && (
			<ListItem
				label={site.name || site.url}
				info={site.connection_status && site.connection_status.message}
				action={<Button title="Remove" onPress={handleRemove} background="clear" type="critical" />}
				// icon={<Avatar src="https://wcpos.com/favicon.ico" />}
				onPress={handlePress}
			/>
		)
	);
};

export default Site;
