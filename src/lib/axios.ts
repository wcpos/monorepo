import axios from 'axios';
export const noConfigAxios = axios;

/**
 * Create axios instance with default config
 */
const instance = axios.create({
  // baseURL: 'https://some-domain.com/api/',
  // timeout: 1000,
  headers: { 'X-WCPOS': '1' },
  // transformRequest: [
  //   (data, headers) => {
  //     // Do whatever you want to transform the data
  //     debugger;
  //     console.log(headers);
  //     return data;
  //   },
  // ],
});

export default instance;
