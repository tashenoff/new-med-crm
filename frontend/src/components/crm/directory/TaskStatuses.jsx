import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, GripVertical, Lock } from 'lucide-react';
import Modal from '../../modals/Modal';
import PanelHeader from '../../common/PanelHeader';
import { inputClasses, labelClasses } from '../../modals/modalUtils';
import { useTheme, themeClasses, cn } from '../../../hooks/useTheme';

const API = import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com';

const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#14B8A6', '#A855F7', '#DC2626', '#6B7280', '#0EA5E9'];
const PRESET_ICONS = ['📋', '⏳', '✅', '❌', '⚠️', '🔔', '⭐', '🎯', '💼', '📌', '🚀', '⏰'];

const TaskStatuses = ({ user }) => {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { isDarkMode } = useTheme();

  const [formData, setFormData] = useState({
    name: '', code: '', description: '', color: '#3B82F6', icon: '📋',
    order: 0, is_default: false, is_completed: false, is_cancelled: false
  });

  const fetchStatuses = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/crm/task-statuses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStatuses(data.statuses || []);
      }
    } catch (error) {
      setError('Ошибка загрузки статусов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatuses(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const token = localStorage.getItem('token');
      const url = editingStatus ? `${API}/api/crm/task-statuses/${editingStatus.id}` : `${API}/api/crm/task-statuses`;
      const response = await fetch(url, {
        method: editingStatus ? 'PUT' : 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setSuccess(editingStatus ? 'Статус обновлён' : 'Статус создан');
        fetchStatuses();
        handleCloseModal();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка сохранения');
      }
    } catch (error) { 
      console.error('Save error:', error);
      setError('Ошибка соединения: ' + error.message); 
    }
  };

  const handleDelete = async (status) => {
    if (status.is_system) { setError('Нельзя удалить системный статус'); setTimeout(() => setError(''), 3000); return; }
    if (!window.confirm(`Удалить статус "${status.name}"?`)) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/crm/task-statuses/${status.id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) { setSuccess('Статус удалён'); fetchStatuses(); setTimeout(() => setSuccess(''), 3000); }
      else { const errorData = await response.json(); setError(errorData.detail || 'Ошибка удаления'); setTimeout(() => setError(''), 5000); }
    } catch (error) { setError('Ошибка соединения'); }
  };

  const handleEdit = (status) => {
    setEditingStatus(status);
    setFormData({ name: status.name, code: status.code, description: status.description || '',
      color: status.color, icon: status.icon || '📋', order: status.order,
      is_default: status.is_default, is_completed: status.is_completed, is_cancelled: status.is_cancelled });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false); setEditingStatus(null);
    setFormData({ name: '', code: '', description: '', color: '#3B82F6', icon: '📋', order: statuses.length, is_default: false, is_completed: false, is_cancelled: false });
  };

  const generateCode = (name) => name.toLowerCase()
    .replace(/[а-яё]/g, c => ({'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'}[c] || c))
    .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const filteredStatuses = statuses.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.code.toLowerCase().includes(searchTerm.toLowerCase()));
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <div className="space-y-6">
      <div className={cn("rounded-2xl", themeClasses.bg.card)}>
        <PanelHeader title="Статусы задач" subtitle="Управление статусами задач CRM"
          onAction={isAdmin ? () => { setFormData(prev => ({...prev, order: statuses.length})); setShowModal(true); } : undefined}
          actionLabel="+ Добавить статус" />
        
        {error && <div className="mx-6 mb-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
        {success && <div className="mx-6 mb-4 p-3 bg-green-100 text-green-700 rounded-lg">{success}</div>}

        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Поиск статусов..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={cn("w-full pl-10 pr-4 py-2 rounded-lg border", themeClasses.input.default, themeClasses.input.focus)} />
          </div>
        </div>

        <div className="px-6 pb-6">
          {loading ? <div className="text-center py-8 text-gray-500">Загрузка...</div>
           : filteredStatuses.length === 0 ? <div className="text-center py-8 text-gray-500">Статусы не найдены</div>
           : (
            <div className="space-y-2">
              {filteredStatuses.map((status) => (
                <div key={status.id} className={cn("flex items-center gap-4 p-4 rounded-lg border transition-all hover:shadow-md", themeClasses.bg.card, themeClasses.border.default)}>
                  <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ backgroundColor: status.color + '20', color: status.color }}>{status.icon || '📋'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-medium", themeClasses.text.primary)}>{status.name}</span>
                      {status.is_system && <Lock className="w-4 h-4 text-gray-400" title="Системный" />}
                      {status.is_default && <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">По умолчанию</span>}
                      {status.is_completed && <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Завершён</span>}
                      {status.is_cancelled && <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">Отменён</span>}
                    </div>
                    <div className={cn("text-sm", themeClasses.text.secondary)}>
                      <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{status.code}</span>
                      {status.description && <span className="ml-2">{status.description}</span>}
                    </div>
                  </div>
                  <div className="w-6 h-6 rounded-full border-2" style={{ backgroundColor: status.color }} title={status.color} />
                  {isAdmin && (
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(status)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Редактировать"><Edit2 className="w-4 h-4" /></button>
                      {!status.is_system && <button onClick={() => handleDelete(status)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Удалить"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Modal show={showModal} onClose={handleCloseModal} title={editingStatus ? 'Редактировать статус' : 'Новый статус'} size="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Название *</label>
              <input type="text" value={formData.name} onChange={(e) => { const name = e.target.value; setFormData(prev => ({...prev, name, code: !editingStatus ? generateCode(name) : prev.code})); }} className={inputClasses} required />
            </div>
            <div>
              <label className={labelClasses}>Код *</label>
              <input type="text" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')})} className={inputClasses} required disabled={editingStatus?.is_system} />
            </div>
          </div>
          <div>
            <label className={labelClasses}>Описание</label>
            <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className={inputClasses} rows="2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Иконка</label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-lg">
                {PRESET_ICONS.map((icon) => (
                  <button key={icon} type="button" onClick={() => setFormData({...formData, icon})} className={cn("w-8 h-8 rounded flex items-center justify-center", formData.icon === icon ? "bg-blue-100 ring-2 ring-blue-500" : "hover:bg-gray-100")}>{icon}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClasses}>Цвет</label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-lg">
                {PRESET_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setFormData({...formData, color})} className={cn("w-6 h-6 rounded-full", formData.color === color ? "ring-2 ring-offset-2 ring-blue-500" : "")} style={{ backgroundColor: color }} />
                ))}
              </div>
              <input type="color" value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} className="mt-2 w-full h-8" />
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-3"><input type="checkbox" checked={formData.is_default} onChange={(e) => setFormData({...formData, is_default: e.target.checked})} className="w-4 h-4" /><span className="text-sm">Статус по умолчанию</span></label>
            <label className="flex items-center gap-3"><input type="checkbox" checked={formData.is_completed} onChange={(e) => setFormData({...formData, is_completed: e.target.checked, is_cancelled: false})} className="w-4 h-4" /><span className="text-sm">Завершённый статус</span></label>
            <label className="flex items-center gap-3"><input type="checkbox" checked={formData.is_cancelled} onChange={(e) => setFormData({...formData, is_cancelled: e.target.checked, is_completed: false})} className="w-4 h-4" /><span className="text-sm">Отменённый статус</span></label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-gray-600">Отмена</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">{editingStatus ? 'Сохранить' : 'Создать'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TaskStatuses;
