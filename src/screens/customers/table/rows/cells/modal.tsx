import * as React from 'react';
import AceEditor from 'react-ace';
import Button from '@wcpos/common/src/components/button';

import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-github';

type Props = {
	customer: any;
	setVisible: any;
};

const Modal = ({ customer, setVisible }: Props) => {
	const close = () => {
		setVisible(false);
	};

	return (
		<>
			<AceEditor
				mode="json"
				theme="github"
				value={JSON.stringify(customer, null, ' ')}
				setOptions={{ tabSize: 2 }}
			/>
			<Button onPress={close} title="Close" />
		</>
	);
};

export default Modal;
