
import { Navigate, useLocation } from 'react-router-dom';

export default function TherapyAuth() {
  const location = useLocation();
  const search = location.search;
  return <Navigate to={`/vault${search}`} replace />;
}
