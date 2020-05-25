import React from 'react';
import { View, Text } from 'react-native';
import Products from './products';
import Cart from './cart';
import Draggable from '../../components/draggable';
import Button from '../../components/button';
import useStore from '../../hooks/use-store';
import useObservable from '../../hooks/use-observable';
import { Q } from '@nozbe/watermelondb';

interface Props {}

const initialUI = {
	pos_products: {
		width: 500,
	},
};

const reducer = (state, action) => {
	switch (action.type) {
		case 'UI_UPDATE':
			return { ...state, ...action.payload };
		default:
			return state;
	}
};

const useUI = () => {
	const { store } = useStore();
	const collection = store.collections.get('uis');

	const ui = useObservable(
		collection.query(Q.where('section', 'pos_products')).observe()
		// .observeWithColumns(['name', 'regular_price']),
	);

	if (ui.length > 1) {
	}
};

const POS: React.FC<Props> = () => {
	const [ui, dispatch] = React.useReducer(reducer, initialUI);
	// const width = React.useRef(ui?.pos_products?.width).current;
	// console.log(width);
	// const width =

	console.log('render:' + ui?.pos_products?.width);
	// const [width, setWidth] = React.useState(ui?.pos_products?.width);

	const handleColumnResizeUpdate = ({ dx }) => {
		// console.log('render:' + width);
		// setWidth(width + dx);
		dispatch({
			type: 'UI_UPDATE',
			payload: { pos_products: { width: ui?.pos_products?.width + dx } },
		});
	};

	const handleColumnResizeEnd = () => {
		console.log('end:' + ui?.pos_products?.width);
		// dispatch({ type: 'UI_UPDATE', payload: { pos_products: { width } } });
	};

	return (
		<React.Fragment>
			<View style={{ width: ui?.pos_products?.width }}>
				<Products />
			</View>
			<Draggable onUpdate={handleColumnResizeUpdate} onEnd={handleColumnResizeEnd}>
				<View style={{ backgroundColor: '#000', padding: 20 }}></View>
			</Draggable>
			<View style={{ flexGrow: 1 }}>
				<Cart />
			</View>
		</React.Fragment>
	);
};

export default POS;
