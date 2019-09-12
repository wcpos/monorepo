import React from 'react';
import Portal from '../portal';
import Arrow from '../arrow';
import { StyledPopoverView, Wrapper } from './styles';

export type Props = {
	children: React.ReactChild;
};

const PopoverView: React.FunctionComponent<Props> = ({ children }) => {
	return (
		<Portal>
			<Wrapper>
				<Arrow />
				<StyledPopoverView>{children}</StyledPopoverView>
			</Wrapper>
		</Portal>
	);
};

export default PopoverView;
