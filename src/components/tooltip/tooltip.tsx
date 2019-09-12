import React, { Fragment, useState } from 'react';
import useLayout from '../../hooks/use-layout';
import { TargetWrapper } from './styles';
import TooltipView from './view';
import Touchable from '../touchable';

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
		console.log('pressed');
		setVisible(!visible);
	};

	return (
		<Fragment>
			<Touchable
				onLayout={onLayout}
				onPress={toggleTooltip}
				onMouseEnter={showTooltip}
				onMouseLeave={hideTooltip}
			>
				{children}
			</Touchable>
			{visible && (
				<TooltipView top={layout.y} left={layout.x}>
					{text}
				</TooltipView>
			)}
		</Fragment>
	);
};

export default Tooltip;
