import React, { useState, useEffect } from 'react';

const ManagersView = ({ user }) => {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchManagers();
  }, []);

  const fetchManagers = async () => {
    try {
      setLoading(true);
      // Mock data
      setTimeout(() => {
        setManagers([
          {
            id: 'mgr1',
            name: 'Анна Менеджер',
            email: 'anna@clinic.com',
            phone: '+7 777 111 2233',
            active_leads: 5,
            total_deals: 12,
            conversion_rate: 75,
            status: 'active'
          }
        ]);
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Error fetching managers:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-curai-control"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-curai-ink">👨‍💼 Менеджеры</h1>
          <p className="text-curai-muted mt-1">Управление командой менеджеров</p>
        </div>
        <button className="bg-curai-blue text-white px-4 py-2 rounded-md hover:bg-curai-blue transition-colors">
          + Новый менеджер
        </button>
      </div>

      <div className="bg-curai-surface rounded-md shadow-none border border-curai-border">
        {managers.length === 0 ? (
          <div className="text-center py-8 text-curai-muted">
            <p>Менеджеры не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-curai-border">
              <thead className="bg-curai-subtle">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Менеджер
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Контакты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Активные заявки
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Конверсия
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Статус
                  </th>
                </tr>
              </thead>
              <tbody className="bg-curai-surface divide-y divide-curai-border">
                {managers.map((manager) => (
                  <tr key={manager.id} className="hover:bg-curai-subtle">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-curai-ink">{manager.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-curai-ink">{manager.phone}</div>
                      <div className="text-sm text-curai-muted">{manager.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-curai-ink">{manager.active_leads}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-curai-positive">{manager.conversion_rate}%</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full font-medium bg-curai-positiveBg text-curai-positive">
                        Активен
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagersView;




