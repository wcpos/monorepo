I am having different CORS issues for electron and web:

- If I use default `fetch` for web, it works fine, but electron doesn't work in some cases
- If I use useHttpClient it works for electron, but not for electron in some cases
- For native, we just let the expo-image package handle the fetch and caching


@TODO - refactor the useHttpClient so that it uses native APIs, eg: fetch for web, .net for electron