import React from 'react';
import CuraiIcon from '../common/CuraiIcon';
import NavigationItem from './NavigationItem';
import { getNavigationMenu, warehouseMenuItems } from './navigationCatalog';

const Navigation = ({
  activeTab,
  setActiveTab,
  availableTabs,
  sidebarOpen,
  setSidebarOpen,
  user,
  activeSection,
  warehouseView,
  onWarehouseSectionChange,
  onToggleSidebar
}) => {
  const [expandedSections, setExpandedSections] = React.useState({
    statistics: true // Автоматически раскрываем статистику
  });
  const [warehouseActiveItem, setWarehouseActiveItem] = React.useState(warehouseMenuItems[0].key);

  React.useEffect(() => {
    if (activeSection === 'warehouse') {
      setWarehouseActiveItem(warehouseMenuItems[0].key);
    }
  }, [activeSection]);

  React.useEffect(() => {
    if (!warehouseView) return;
    const match = warehouseMenuItems.find(item => item.key === warehouseView);
    setWarehouseActiveItem(match ? match.key : warehouseMenuItems[0].key);
  }, [warehouseView]);
  const getMenuStructure = () => getNavigationMenu(user, activeSection);

  const handleTabClick = (tabKey) => {
    setActiveTab(tabKey);
    // Close sidebar on mobile after selection
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const handleWarehouseItemClick = (itemKey) => {
    setWarehouseActiveItem(itemKey);
    handleTabClick('warehouse');
    if (onWarehouseSectionChange) {
      onWarehouseSectionChange(itemKey);
    }
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const handleSubTabClick = (subTabKey) => {
    setActiveTab(subTabKey);
    // Автоматически раскрываем родительскую секцию
    setExpandedSections(prev => {
      if (subTabKey === 'treatment-statistics' || subTabKey === 'doctor-statistics') {
        return { ...prev, statistics: true };
      } else if (subTabKey === 'service-prices' || subTabKey === 'laboratories' || subTabKey === 'lab-price-statistics' || subTabKey === 'room-management' || subTabKey === 'specialties' || subTabKey === 'payment-types' || subTabKey === 'loyalty') {
        return { ...prev, directory: true };
      } else if (subTabKey === 'services-report') {
        return { ...prev, 'hms-reports': true };
      }
      return prev;
    });
    // Close sidebar on mobile after selection
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };


  const collapsed = !sidebarOpen;
  const toggleSidebar = () => onToggleSidebar ? onToggleSidebar() : setSidebarOpen(!sidebarOpen);
  const renderGroup = item => {
    const children = item.subItems || item.children || [];
    const active = children.some(child => child.key === activeTab);
    return <div key={item.key}>
      <NavigationItem label={item.label} icon={item.key} collapsed={collapsed} active={active}
        expanded={sidebarOpen && Boolean(expandedSections[item.key])}
        aria-controls={`navigation-group-${item.key}`}
        onClick={() => {
          if (collapsed) {
            setExpandedSections(previous => ({ ...previous, [item.key]: true }));
            setSidebarOpen(true);
          } else toggleSection(item.key);
        }} />
      {sidebarOpen && expandedSections[item.key] && <div id={`navigation-group-${item.key}`} className="curai-navigation-submenu">
        {children.map(child => <NavigationItem key={child.key} label={child.label} icon={child.key} active={activeTab === child.key} data-guide={`nav-${child.key}`} onClick={() => handleSubTabClick(child.key)} />)}
      </div>}
    </div>;
  };

  return <>
    {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    <nav id="workspace-navigation" aria-label="Разделы приложения" className={`curai-sidebar ${sidebarOpen ? 'is-expanded' : 'is-collapsed'}`}>
      <div className="curai-sidebar-toggle"><NavigationItem label={sidebarOpen ? 'Свернуть меню' : 'Открыть меню'} icon={sidebarOpen ? 'collapse' : 'menu'} collapsed={collapsed} expanded={sidebarOpen} onClick={toggleSidebar} /></div>
      <div className="curai-sidebar-items">
        {getMenuStructure().map(item => {
          if (item.type === 'warehouse-label') return sidebarOpen ? <div key={item.key} className="curai-navigation-section">{item.label}</div> : null;
          if (item.type === 'warehouse-item') return <NavigationItem key={item.key} label={item.label} icon={item.key} collapsed={collapsed} active={warehouseActiveItem === item.key} onClick={() => handleWarehouseItemClick(item.key)} />;
          if (item.type === 'tab') return <NavigationItem key={item.key} label={item.label} icon={item.key} collapsed={collapsed} active={activeTab === item.key} data-guide={`nav-${item.key}`} onClick={() => handleTabClick(item.key)} />;
          if (item.type === 'accordion' || item.type === 'section') return renderGroup(item);
          return null;
        })}
      </div>
      <div className="curai-sidebar-footer"><NavigationItem label={sidebarOpen ? 'Свернуть меню' : 'Развернуть меню'} icon={sidebarOpen ? 'collapse' : 'expand'} collapsed={collapsed} expanded={sidebarOpen} onClick={toggleSidebar} /></div>
    </nav>
  </>;
};

export default Navigation;
