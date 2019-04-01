import React from 'react';
import ReactDOM from 'react-dom';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

{
	/* <script>
  window.postMessage("Sending data from WebView");
</script> */
}

// @TODO: use normal modal instead
const Modal = ({ navigation }: Props) => {
	const uri = navigation.getParam('url');

	const handleMessage = ({ data }: MessageEvent) => {
		if (data.username) {
			// update user info
			console.log('user', data);
			// user.updateFromJson(data);
		}
		if (data.consumer_key) {
			// add keys
			console.log('keys', data);
			navigation.navigate('Auth');
		}
	};

	React.useEffect(() => {
		window.addEventListener('message', handleMessage);
		return () => {
			window.removeEventListener('message', handleMessage);
		};
	});

	return <iframe title="Auth" src={uri} width="100%" height="100%" />;

	// const handleMessage = data => {
	// 	console.log(data);
	// 	navigation.navigate('Auth');
	// };

	// const [containerEl] = React.useState(document.createElement('div'));
	// let externalWindow = null;

	// React.useEffect(() => {
	// 	externalWindow = window.open('', '', 'width=600,height=400,left=200,top=200');

	// 	externalWindow.document.body.appendChild(containerEl);
	// 	externalWindow.addEventListener('beforeunload', () => {
	// 		props.closePopupWindowWithHooks();
	// 	});

	// 	console.log('Created Popup Window');

	// 	return function cleanup() {
	// 		console.log('Cleaned up Popup Window');
	// 		externalWindow.close();
	// 		externalWindow = null;
	// 	};
	// }, []);

	// return ReactDOM.createPortal(uri, containerEl);
};

export default Modal;
