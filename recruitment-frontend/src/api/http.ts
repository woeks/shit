import axios from 'axios';
import { apiBaseUrl } from './base';
import { clearAuthSession, getToken } from '../utils/auth';

const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000
});

http.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error?.response?.status === 401) {
      clearAuthSession();

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default http;
