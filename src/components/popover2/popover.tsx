import * as React from 'react';
import { View } from 'react-native';
import PopoverView from './view';
import PopoverContext from './context';
import Portal from '../portal2';

interface Props {
	trigger: React.ReactNode;
	children: React.ReactNode;
	visible: boolean;
	onRequestClose?: () => void;
}

const Popover = ({ children, trigger, visible, onRequestClose }: Props) => {
	const ref = React.useRef<View>(null);

	return (
		<View ref={ref}>
			{trigger}
			<Portal>
				<PopoverContext.Provider value={{ requestClose: onRequestClose }}>
					<PopoverView visible={visible}>{children}</PopoverView>
				</PopoverContext.Provider>
			</Portal>
		</View>
	);
};

export default Popover;
