import React from 'react';
import { View, Text } from 'react-native';
import Products from './products';
import Cart from './cart';
import Draggable from '../../components/draggable';
import useStore from '../../hooks/use-store';

interface Props {}

const POS: React.FC<Props> = () => {
	const { store } = useStore();
	const [width, setWidth] = React.useState(500);

	console.log('render:' + width);

	const handleColumnResizeUpdate = ({ dx }) => {
		setWidth(width + dx);
	};

	const handleColumnResizeEnd = async () => {
		console.log('end:' + width);
		await store.adapter.setLocal('width', width + '');
	};

	// fetch last user hash on init
	React.useEffect(() => {
		const getWidth = async () => {
			const storedWidth = await store.adapter.getLocal('width');
			console.log(storedWidth);
			if (storedWidth) {
				setWidth(parseInt(storedWidth, 10));
			}
		};

		getWidth();
	}, []);

	return (
		<React.Fragment>
			<View style={{ width }}>
				<Products />
				<Text>{width + ''}</Text>
			</View>
			<Draggable onUpdate={handleColumnResizeUpdate} onEnd={handleColumnResizeEnd}>
				<View style={{ backgroundColor: '#000', padding: 20 }}></View>
			</Draggable>
			<View>
				<Cart />
			</View>
		</React.Fragment>
	);
};

export default POS;
