import React from 'react';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

// @TODO: use normal modal instead
const Modal = ({ navigation }: Props) => {
	const site = navigation.getParam('site');
	const user = navigation.getParam('user');

	const handleMessage = ({ data }: MessageEvent) => {
		if (data.source === 'wcpos') {
			debugger;
			user.updateFromJSON(data.payload);
			if (user.isAuthorized()) {
				navigation.navigate('Auth');
			}
		}
	};

	React.useEffect(() => {
		window.addEventListener('message', handleMessage);
		return () => {
			window.removeEventListener('message', handleMessage);
		};
	});

	return <iframe title="Auth" src={site.wcAuthUrl} width="100%" height="100%" />;

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
