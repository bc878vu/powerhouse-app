import { getToken } from './auth';

export const isPublic = () => {
  return !getToken(); // NOT LOGGED IN = PUBLIC
};