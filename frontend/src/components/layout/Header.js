import React from 'react';
import NavigationSearch from './NavigationSearch';
import WorkspaceTabs from './WorkspaceTabs';
import CuraiIcon from '../common/CuraiIcon';
import CuraiButton from '../common/CuraiButton';
import { useNotifications } from '../../context/NotificationContext';
import { useGuide } from '../../context/GuideContext';

const Header = ({ user, onLogout, onToggleSidebar, sidebarOpen, activeSection, setActiveSection, onNavigate }) => {
  const { unreadCount, togglePanel } = useNotifications();
  const { openGuideModal } = useGuide();
  const role = user?.role === 'super_admin' ? 'Супер-админ' : user?.role === 'admin' ? 'Администратор' : user?.role === 'doctor' ? 'Врач' : 'Пациент';
  return <header className="curai-navbar">
    <CuraiButton variant="ghost" iconOnly className="curai-mobile-menu" onClick={onToggleSidebar} aria-label="Open sidebar" aria-expanded={sidebarOpen} aria-controls="workspace-navigation" data-testid="mobile-hamburger"><CuraiIcon name="menu" /></CuraiButton>
    <div className="curai-brand" aria-label="Curai">curai</div>
    {user && <WorkspaceTabs user={user} activeSection={activeSection} onChange={setActiveSection} />}
    {user && <div className="curai-navbar-actions">
      <NavigationSearch user={user} onNavigate={onNavigate} />
      <CuraiButton variant="ghost" iconOnly onClick={openGuideModal} aria-label="Гид по системе" title="Гид по системе" data-guide="guide-help"><CuraiIcon name="help" /></CuraiButton>
      <CuraiButton variant="ghost" iconOnly className="relative" onClick={togglePanel} aria-label="Уведомления" title="Уведомления"><CuraiIcon name="notifications" />{unreadCount > 0 && <span className="curai-notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}</CuraiButton>
      <div className="curai-user" title={`${user.full_name || ''} · ${role}`}><span className="curai-user-name">{user.full_name}</span><span className="curai-avatar" aria-label={user.full_name}>{user.full_name?.charAt(0)?.toUpperCase()}</span></div>
      <CuraiButton variant="ghost" iconOnly onClick={onLogout} aria-label="Выход" title="Выход"><CuraiIcon name="logout" /></CuraiButton>
    </div>}
  </header>;
};
export default Header;
