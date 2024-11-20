import parse from './parse-link-header';

describe('Parse Link Header', () => {
	it('parsing a proper link header with next and last', () => {
		const link =
			'<https://api.github.com/user/9287/repos?client_id=1&client_secret=2&page=2&per_page=100>; rel="next", ' +
			'<https://api.github.com/user/9287/repos?client_id=1&client_secret=2&page=3&per_page=100>; rel="last"';

		expect(parse(link)).toEqual({
			last: {
				client_id: '1',
				client_secret: '2',
				page: '3',
				per_page: '100',
				rel: 'last',
				url:
					'https://api.github.com/user/9287/repos?client_id=1&client_secret=2&page=3&per_page=100',
			},
			next: {
				client_id: '1',
				client_secret: '2',
				page: '2',
				per_page: '100',
				rel: 'next',
				url:
					'https://api.github.com/user/9287/repos?client_id=1&client_secret=2&page=2&per_page=100',
			},
		});
	});

	it('handles unquoted relationships', () => {
		const link =
			'<https://api.github.com/user/9287/repos?client_id=1&client_secret=2&page=2&per_page=100>; rel=next, ' +
			'<https://api.github.com/user/9287/repos?client_id=1&client_secret=2&page=3&per_page=100>; rel=last';

		expect(parse(link)).toEqual({
			last: {
				client_id: '1',
				client_secret: '2',
				page: '3',
				per_page: '100',
				rel: 'last',
				url:
					'https://api.github.com/user/9287/repos?client_id=1&client_secret=2&page=3&per_page=100',
			},
			next: {
				client_id: '1',
				client_secret: '2',
				page: '2',
				per_page: '100',
				rel: 'next',
				url:
					'https://api.github.com/user/9287/repos?client_id=1&client_secret=2&page=2&per_page=100',
			},
		});
	});

	it('parsing a proper link header with next, prev and last', () => {
		const link =
			'<https://api.github.com/user/9287/repos?page=3&per_page=100>; rel="next", ' +
			'<https://api.github.com/user/9287/repos?page=1&per_page=100>; rel="prev", ' +
			'<https://api.github.com/user/9287/repos?page=5&per_page=100>; rel="last"';

		expect(parse(link)).toEqual({
			last: {
				page: '5',
				per_page: '100',
				rel: 'last',
				url: 'https://api.github.com/user/9287/repos?page=5&per_page=100',
			},
			next: {
				page: '3',
				per_page: '100',
				rel: 'next',
				url: 'https://api.github.com/user/9287/repos?page=3&per_page=100',
			},
			prev: {
				page: '1',
				per_page: '100',
				rel: 'prev',
				url: 'https://api.github.com/user/9287/repos?page=1&per_page=100',
			},
		});
	});

	it('parsing an empty link header', () => {
		expect(parse('')).toEqual({});
		expect(parse()).toEqual({});
	});

	it('parsing a proper link header with next and a link without rel', () => {
		const link =
			'<https://api.github.com/user/9287/repos?page=3&per_page=100>; rel="next", ' +
			'<https://api.github.com/user/9287/repos?page=1&per_page=100>; pet="cat", ';

		expect(parse(link)).toEqual({
			next: {
				page: '3',
				per_page: '100',
				rel: 'next',
				url: 'https://api.github.com/user/9287/repos?page=3&per_page=100',
			},
		});
	});

	it('parsing a proper link header with next and properties besides rel', () => {
		const link =
			'<https://api.github.com/user/9287/repos?page=3&per_page=100>; rel="next"; hello="world"; pet="cat"';

		expect(parse(link)).toEqual({
			next: {
				hello: 'world',
				page: '3',
				per_page: '100',
				pet: 'cat',
				rel: 'next',
				url: 'https://api.github.com/user/9287/repos?page=3&per_page=100',
			},
		});
	});

	it('parsing a proper link header with a comma in the url', () => {
		const link = '<https://imaginary.url.notreal/?name=What,+me+worry>; rel="next";';

		expect(parse(link)).toEqual({
			next: {
				name: 'What, me worry',
				rel: 'next',
				url: 'https://imaginary.url.notreal/?name=What,+me+worry',
			},
		});
	});

	it('parsing a proper link header with a multi-word rel', () => {
		const link = '<https://imaginary.url.notreal/?name=What,+me+worry>; rel="next page";';

		expect(parse(link)).toEqual({
			next: {
				name: 'What, me worry',
				rel: 'next',
				url: 'https://imaginary.url.notreal/?name=What,+me+worry',
			},
			page: {
				name: 'What, me worry',
				rel: 'page',
				url: 'https://imaginary.url.notreal/?name=What,+me+worry',
			},
		});
	});

	it('parsing a proper link header with matrix parameters', () => {
		const link =
			'<https://imaginary.url.notreal/segment;foo=bar;baz/item?name=What,+me+worry>; rel="next";';

		expect(parse(link)).toEqual({
			next: {
				name: 'What, me worry',
				rel: 'next',
				url: 'https://imaginary.url.notreal/segment;foo=bar;baz/item?name=What,+me+worry',
			},
		});
	});
});
