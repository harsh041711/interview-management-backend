import { Outlet } from 'react-router-dom';
import './PublicLayout.scss';

export default function PublicLayout() {
  return (
    <div className="public-layout">
      <Outlet />
    </div>
  );
}
