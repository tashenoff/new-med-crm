import React from 'react';
import WarehouseMaterials from '../components/warehouse/WarehouseMaterials';
import WarehouseInventory from '../components/warehouse/WarehouseInventory';
import WarehouseAttention from '../components/warehouse/WarehouseAttention';

const WarehousePage = ({ user, warehouseView = 'warehouse-materials', onOpenAiChat, onCloseAiChat, aiChatSidebarOpen, materialRefreshTrigger }) => {
  const renderSection = () => {
    if (warehouseView === 'warehouse-materials' || warehouseView === 'warehouse-deleted') {
      return <WarehouseMaterials
        user={user}
        viewKey={warehouseView}
        onOpenAiChat={onOpenAiChat}
        onCloseAiChat={onCloseAiChat}
        aiChatSidebarOpen={aiChatSidebarOpen}
        materialRefreshTrigger={materialRefreshTrigger}
      />;
    }

    if (warehouseView === 'warehouse-inventory') {
      return <WarehouseInventory user={user} />;
    }

    if (warehouseView === 'warehouse-attention') {
      return <WarehouseAttention />;
    }

    return <WarehouseMaterials user={user} viewKey="warehouse-materials" />;
  };

  return (
    <div className="space-y-6">
      {renderSection()}
    </div>
  );
};

export default WarehousePage;
