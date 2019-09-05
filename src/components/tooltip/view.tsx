import React from 'react';
import Portal from '../portal';
import { TooltipWrapper, TooltipText } from './styles';

type Props = {
	children: string;
	top: number;
	left: number;
};

const View = ({ children, top, left }) => {
	return (
		<Portal>
			<TooltipWrapper style={{ top, left }}>
				<TooltipText>{children}</TooltipText>
			</TooltipWrapper>
		</Portal>
	);
};

export default View;
