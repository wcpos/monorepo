import React from 'react';
import { WebView } from 'react-native-webview';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

{
	/* <script>
  window.postMessage("Sending data from WebView");
</script> */
}

const Modal = ({ navigation }: Props) => {
	const uri = navigation.getParam('url');

	const handleMessage = data => {
		console.log(data);
		navigation.navigate('Auth');
	};

	return <WebView source={{ uri }} ref="authModal" onMessage={handleMessage} />;
};

export default Modal;
