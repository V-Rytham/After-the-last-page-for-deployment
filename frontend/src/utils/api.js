import axios from 'axios';
import { getApiBaseUrl } from './serviceUrls';

const baseURL = getApiBaseUrl();

const api = axios.create({
  baseURL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptor to inject token if we have one
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const statusCode = Number(error?.response?.status || 0) || null;
    const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''));
    const mappedMessage = statusCode === 504
      ? 'This book is large and taking longer than expected.'
      : (isTimeout ? 'Still loading, please retry.' : null);
    const message = mappedMessage
      || error?.response?.data?.message
      || error?.message
      || 'Request failed.';

    return Promise.reject({
      ...error,
      uiMessage: message,
      statusCode,
    });
  },
);

export default api;
