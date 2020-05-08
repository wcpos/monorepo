import React from 'react';
import { LeftView, RightView, CenterView, TitleText } from './styles';

interface Props {
	left?: React.ReactNode;
	right?: React.ReactNode;
	title?: string | React.ReactNode;
}

const Header: React.FC<Props> = ({ left, right, title = '' }) => {
	return (
		<>
			{left && <LeftView>{left}</LeftView>}
			<CenterView>
				<TitleText>{title}</TitleText>
			</CenterView>
			{right && <RightView>{right}</RightView>}
		</>
	);
};

export default Header;
