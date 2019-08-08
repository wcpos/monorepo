import React from 'react';
import { Wrapper, Masterbar, Main } from './styles';

type Props = {
	children?: React.ReactNode;
	masterbar?: React.ReactNode;
	main?: React.ReactNode;
};

const Layout = ({ children, main, masterbar }: Props) => {
	return (
		<Wrapper>
			<Masterbar>{masterbar}</Masterbar>
			<Main>{main}</Main>
		</Wrapper>
	);
};

export default Layout;
