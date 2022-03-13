import { AxiosResponse } from 'axios';
import { useNavigation } from '@react-navigation/native';
import useSnackbar from '@wcpos/common/src/components/snackbar/';

export const useErrorResponseHandler = () => {
	const navigation = useNavigation();
	const addSnackbar = useSnackbar();

	return (res: AxiosResponse) => {
		if (!res) {
			console.log('CORS error?');
			return;
		}

		switch (res.status) {
			case 400:
				addSnackbar({ message: res.data.message });
				break;
			case 401:
			case 403:
				navigation.navigate('Login');
				break;
			case 404:
				console.log('404 error', res);
				break;
			case 500:
				console.log('500 Internal server error', res);
				break;
			default:
				console.log('Unknown error', res);
		}
	};
};
