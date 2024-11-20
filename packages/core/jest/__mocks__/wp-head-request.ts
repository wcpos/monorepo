import response from '../__fixtures__/wp-head-response.json';

function head(url) {
	return new Promise((resolve, reject) => {
		process.nextTick(() => resolve(response));
	});
}

export default { head };
