import React, { Fragment, useState } from 'react';
import useLayout from '../../hooks/use-layout';
import { TargetWrapper } from './styles';
import TooltipView from './view';

type Props = {
	children: React.ReactChild;
	placement?: 'top' | 'bottom' | 'left' | 'right';
	text: string;
};

const Tooltip = ({ children, placement = 'top', text }: Props) => {
	const [visible, setVisible] = useState(false);
	const { onLayout, ...layout } = useLayout();
	console.log('layout: ', layout);

	const showTooltip = () => {
		setVisible(true);
	};

	const hideTooltip = () => {
		setVisible(false);
	};

	const toggleTooltip = () => {
		setVisible(!visible);
	};

	return (
		<Fragment>
			<TargetWrapper
				onLayout={onLayout}
				onPress={toggleTooltip}
				onMouseEnter={showTooltip}
				onMouseLeave={hideTooltip}
			>
				{children}
			</TargetWrapper>
			{visible && (
				<TooltipView top={layout.y} left={layout.x}>
					{text}
				</TooltipView>
			)}
		</Fragment>
	);
};

export default Tooltip;
