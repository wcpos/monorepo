import React from 'react';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import Avatar from '../../components/avatar';
import List, { ListItem } from '../../components/list';
import { AuthView } from './styles';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

const Auth = ({ navigation }: Props) => {
	const sites = [
		{
			name: 'Site 1',
			url: 'https://demo.wcpos.com',
			icon: <Avatar src="https://demo.wcpos.com/favicon.ico" />,
		},
		{
			name: 'Site 2',
			url: 'https://beta.wcpos.com',
			icon: <Avatar src="https://demo.wcpos.com/favicon.ico" />,
		},
	];

	const checks = [
		{ label: 'Check WordPress', icon: 'completed' },
		{ label: 'Check WooCommerce', icon: 'error' },
		{ label: 'Check WooCommerce POS', icon: 'loading' },
	];

	const renderSite = item => (
		<ListItem
			label={item.name}
			info={item.url}
			icon={item.icon}
			action="Remove"
			onPress={event => {
				console.log(event);
			}}
			onAction={event => {
				console.log(event);
			}}
		/>
	);

	return (
		<AuthView>
			<Segment>
				<Text size="large">Connect</Text>
				<Text>Enter the URL of your WooCommerce store:</Text>
				<TextInput
					prefix="https://"
					action="Connect"
					onAction={() => {
						navigation.navigate('Modal');
					}}
				/>
				<List items={checks} />
			</Segment>
			<Segment>
				<List items={sites} renderItem={renderSite} />
			</Segment>
		</AuthView>
	);
};

export default Auth;
