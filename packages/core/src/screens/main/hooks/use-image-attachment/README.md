I am having different CORS issues for electron and web:

- If I use default `fetch` for web, it works fine, but electron diesn't work in some cases
- If I use useHttpClient it works for electron, but not for electron in some cases
- useHttpClient seems to work okay on native


@TODO - refactor the useHttpClient so that it uses native APIs, eg: fetch for web, .net for electron