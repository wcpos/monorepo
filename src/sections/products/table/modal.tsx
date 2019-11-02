import React from 'react';
import AceEditor from 'react-ace';
import Button from '../../../components/button';

import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-github';

type Props = {
	product: any;
	setVisible: any;
};

const Modal = ({ product, setVisible }: Props) => {
	const [data, setData] = React.useState({});

	React.useEffect(() => {
		async function fetchData() {
			const json = await product.toJSON();
			setData(json);
		}
		fetchData();
	}, [product]);

	const close = () => {
		setVisible(false);
	};

	return (
		<React.Fragment>
			<AceEditor
				mode="json"
				theme="github"
				value={JSON.stringify(data, null, ' ')}
				setOptions={{ tabSize: 2 }}
			/>
			<Button onPress={close} title="Close" />
		</React.Fragment>
	);
};

export default Modal;
