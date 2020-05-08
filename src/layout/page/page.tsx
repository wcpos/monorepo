import React from 'react';
import Header from '../header';
import { PageView, HeaderView, MainView } from './styles';

interface Props {
	header?: string | React.ReactNode;
	children?: React.ReactNode;
}

const Page: React.FC<Props> = ({ children, ...props }) => {
	let headerComponent = props.header;

	if (typeof props.header === 'string') {
		headerComponent = <Header>{props.header}</Header>;
	}

	return (
		<PageView>
			{headerComponent && <HeaderView>{headerComponent}</HeaderView>}
			<MainView>{children}</MainView>
		</PageView>
	);
};

export default Page;
