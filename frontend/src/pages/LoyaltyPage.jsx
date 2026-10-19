import React, { useState } from 'react';
import LoyaltySettings from '../components/loyalty/LoyaltySettings';
import LabServiceCashbackSettings from '../components/loyalty/LabServiceCashbackSettings';

const LoyaltyPage = () => {
  const [activeTab, setActiveTab] = useState('settings');

  const tabs = [
    { id: 'settings', name: 'Настройки бонусов', icon: '⚙️' },
    { id: 'cashback', name: 'Кэшбэк за анализы', icon: '💵' }
  ];

  return (
    <div className="min-h-screen bg-curai-subtle">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Заголовок */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-curai-ink">Программа лояльности</h1>
          <p className="text-curai-muted mt-2">
            Управление бонусной системой для пациентов и кэшбэком для врачей
          </p>
        </div>

        {/* Табы */}
        <div className="border-b border-curai-border mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
 flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
 ${
                    activeTab === tab.id
                      ? "border-curai-control text-curai-blue"
                      : "border-transparent text-curai-muted hover:text-curai-ink hover:border-curai-control"
                  }
                `}
              >
                <span className="text-lg">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Контент табов */}
        <div>
          {activeTab === 'settings' && <LoyaltySettings />}
          {activeTab === 'cashback' && <LabServiceCashbackSettings />}
        </div>
      </div>
    </div>
  );
};

export default LoyaltyPage;
