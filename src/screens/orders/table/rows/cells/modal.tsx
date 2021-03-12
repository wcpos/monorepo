import * as React from 'react';
import AceEditor from 'react-ace';
import Button from '../../../../../components/button';

import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-github';

type Props = {
	order: any;
	setVisible: any;
};

const Modal = ({ order, setVisible }: Props) => {
	const close = () => {
		setVisible(false);
	};

	return (
		<>
			<AceEditor
				mode="json"
				theme="github"
				value={JSON.stringify(order, null, ' ')}
				setOptions={{ tabSize: 2 }}
			/>
			<Button onPress={close} title="Close" />
		</>
	);
};

export default Modal;
