import * as React from 'react';
import { NativeSyntheticEvent, NativeTouchEvent } from 'react-native';

interface Props {
	onKeyDown: (event: NativeSyntheticEvent<NativeTouchEvent>) => void;
}

class Input extends React.Component<Props> {
	componentDidMount() {
		document.addEventListener('keydown', this.handleKeyDown);
	}

	componentWillUnmount() {
		document.removeEventListener('keydown', this.handleKeyDown);
	}

	render() {
		return null;
	}

	handleKeyDown = (event: any) => {
		if (this.props.onKeyDown) {
			this.props.onKeyDown(event);
		}
	};
}

export default Input;
