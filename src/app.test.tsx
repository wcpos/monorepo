import { render } from 'react-testing-library';
import App from './app';

describe('App', () => {
	it('should render', () => {
		const app = render(<App />);
		console.log(app);
	});
});
