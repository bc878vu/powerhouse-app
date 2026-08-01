import { isPublic } from '../utils/publicMode';

export default function PublicWrapper({ children }) {
  if (isPublic()) return null;
  return children;
}