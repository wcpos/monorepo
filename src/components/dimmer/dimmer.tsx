import React from 'react';
import { DimmerView } from './styles';

type Props = {
	children?: React.ReactNode;
	onClick?: () => void;
};

const Dimmer = ({ children, onClick }: Props) => {
	return <DimmerView onClick={onClick}>{children}</DimmerView>;
};

export default Dimmer;
