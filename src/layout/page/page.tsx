import React from 'react';
import { View, Text } from 'react-native';
import Header from '../header';
import { PageView, HeaderView, MainView } from './styles';

interface Props {
	header?: React.ReactNode;
	main?: React.ReactNode;
	title?: string | React.ReactNode;
	children?: React.ReactNode;
}

const Page: React.FC<Props> = ({ header, main, title, children }) => {
	return (
		<PageView>
			{header && (
				<HeaderView>
					<Header title={title} />
				</HeaderView>
			)}
			<MainView>{children ? children : main}</MainView>
		</PageView>
	);
};

export default Page;
