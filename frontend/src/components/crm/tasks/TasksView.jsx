import React, { useState, useEffect } from 'react';
import {
  CheckSquare, Clock, User, AlertCircle, Calendar, Filter, Search,
  Plus, Edit, Trash2, Phone, Mail, MessageSquare, FileText, CheckCircle
} from 'lucide-react';
import { useTheme, themeClasses, cn } from '../../../hooks/useTheme';
import PanelHeader from '../../common/PanelHeader';
import Modal from '../../modals/Modal';
import { inputClasses, selectClasses, labelClasses, buttonPrimaryClasses } from '../../modals/modalUtils';

const TasksView = ({ user }) => {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
    type: 'call',
    lead_id: ''
  });

  const { isDarkMode } = useTheme();

  // Типы заданий
  const taskTypes = {
    call: { label: 'Звонок', icon: Phone, color: 'bg-blue-500' },
    email: { label: 'Письмо', icon: Mail, color: 'bg-green-500' },
    meeting: { label: 'Встреча', icon: Calendar, color: 'bg-purple-500' },
    follow_up: { label: 'Дозвон', icon: Clock, color: 'bg-orange-500' },
    note: { label: 'Заметка', icon: FileText, color: 'bg-gray-500' }
  };

  // Загрузка всех задач
  const fetchTasks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com'}/api/crm/tasks`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
        setFilteredTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Фильтрация задач
  useEffect(() => {
    let filtered = tasks;
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(task => task.status === statusFilter);
    }
    
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(task => task.priority === priorityFilter);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(task => 
        task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredTasks(filtered);
  }, [tasks, statusFilter, priorityFilter, searchTerm]);

  // Создание/обновление задачи
  const handleSaveTask = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const url = editingTask 
        ? `${import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com'}/api/crm/tasks/${editingTask.id}`
        : `${import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com'}/api/crm/tasks`;
      
      const response = await fetch(url, {
        method: editingTask ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newTask)
      });
      
      if (response.ok) {
        setShowCreateModal(false);
        setEditingTask(null);
        setNewTask({
          title: '',
          description: '',
          priority: 'medium',
          due_date: '',
          type: 'call',
          lead_id: ''
        });
        fetchTasks();
      }
    } catch (error) {
      console.error('Error saving task:', error);
    }
  };

  // Отметить задачу выполненной
  const handleToggleComplete = async (taskId, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com'}/api/crm/tasks/${taskId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: currentStatus === 'completed' ? 'pending' : 'completed'
          })
        }
      );
      
      if (response.ok) {
        fetchTasks();
      }
    } catch (error) {
      console.error('Error toggling task:', error);
    }
  };

  // Удаление задачи
  const handleDeleteTask = async (taskId) => {
    if (!confirm('Удалить эту задачу?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com'}/api/crm/tasks/${taskId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (response.ok) {
        fetchTasks();
      }
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  // Статистика задач
  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => !t.completed && new Date(t.due_date) < new Date()).length
  };

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl ${themeClasses.shadow.default}`}>
        <PanelHeader
          title="Задачи"
          subtitle="Управление задачами CRM"
          onAction={() => setShowCreateModal(true)}
          actionLabel="+ Создать задачу"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
          {/* Статистика */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className={cn("p-4 rounded-lg", themeClasses.bg.card, themeClasses.border.default)}>
              <div className="flex items-center space-x-3">
                <CheckSquare className="w-8 h-8 text-blue-500" />
                <div>
                  <p className={cn("text-2xl font-bold", themeClasses.text.primary)}>{stats.total}</p>
                  <p className={cn("text-sm", themeClasses.text.muted)}>Всего задач</p>
                </div>
              </div>
            </div>
            
            <div className={cn("p-4 rounded-lg", themeClasses.bg.card, themeClasses.border.default)}>
              <div className="flex items-center space-x-3">
                <Clock className="w-8 h-8 text-yellow-500" />
                <div>
                  <p className={cn("text-2xl font-bold", themeClasses.text.primary)}>{stats.pending}</p>
                  <p className={cn("text-sm", themeClasses.text.muted)}>В ожидании</p>
                </div>
              </div>
            </div>
            
            <div className={cn("p-4 rounded-lg", themeClasses.bg.card, themeClasses.border.default)}>
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-8 h-8 text-orange-500" />
                <div>
                  <p className={cn("text-2xl font-bold", themeClasses.text.primary)}>{stats.inProgress}</p>
                  <p className={cn("text-sm", themeClasses.text.muted)}>В работе</p>
                </div>
              </div>
            </div>
            
            <div className={cn("p-4 rounded-lg", themeClasses.bg.card, themeClasses.border.default)}>
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <p className={cn("text-2xl font-bold", themeClasses.text.primary)}>{stats.completed}</p>
                  <p className={cn("text-sm", themeClasses.text.muted)}>Выполнено</p>
                </div>
              </div>
            </div>
            
            <div className={cn("p-4 rounded-lg bg-red-50 dark:bg-red-900/20", themeClasses.border.default)}>
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-8 h-8 text-red-500" />
                <div>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.overdue}</p>
                  <p className="text-sm text-red-600 dark:text-red-400">Просрочено</p>
                </div>
              </div>
            </div>
          </div>

          {/* Фильтры */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск задач..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn("pl-9 pr-4 py-2 rounded-lg w-full", themeClasses.input.default)}
                />
              </div>
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={cn("rounded-lg px-3 py-2", themeClasses.input.default)}
            >
              <option value="all">Все статусы</option>
              <option value="pending">В ожидании</option>
              <option value="in_progress">В работе</option>
              <option value="completed">Выполнено</option>
            </select>
            
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={cn("rounded-lg px-3 py-2", themeClasses.input.default)}
            >
              <option value="all">Все приоритеты</option>
              <option value="high">Высокий</option>
              <option value="medium">Средний</option>
              <option value="low">Низкий</option>
            </select>
          </div>

          {/* Список задач */}
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className={cn("mt-4", themeClasses.text.muted)}>Загрузка задач...</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <CheckSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className={cn("text-lg", themeClasses.text.secondary)}>Задач нет</p>
                <p className={cn("text-sm", themeClasses.text.muted)}>Создайте первую задачу</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const TaskIcon = taskTypes[task.type]?.icon || CheckSquare;
                const isOverdue = task.status !== 'completed' && new Date(task.due_date) < new Date();
                
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "p-4 rounded-lg border transition-all hover:shadow-md",
                      task.status === 'completed' 
                        ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                        : isOverdue
                          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                          : themeClasses.bg.card + " " + themeClasses.border.default
                    )}
                  >
                    <div className="flex items-start space-x-4">
                      {/* Checkbox */}
                      <button
                        onClick={() => handleToggleComplete(task.id, task.status)}
                        className={cn(
                          "mt-1 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors",
                          task.status === 'completed'
                            ? "bg-green-500 border-green-500"
                            : "border-gray-300 hover:border-blue-500"
                        )}
                      >
                        {task.status === 'completed' && <CheckCircle className="w-4 h-4 text-white" />}
                      </button>

                      {/* Иконка типа */}
                      <div className={cn(
                        "p-2 rounded-lg",
                        taskTypes[task.type]?.color || 'bg-gray-500'
                      )}>
                        <TaskIcon className="w-5 h-5 text-white" />
                      </div>

                      {/* Содержимое */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h3 className={cn(
                            "font-medium",
                            task.status === 'completed' 
                              ? "line-through text-gray-500" 
                              : themeClasses.text.primary
                          )}>
                            {task.title}
                          </h3>
                          
                          <span className={cn(
                            "px-2 py-1 text-xs rounded-full",
                            task.priority === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                            'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                          )}>
                            {task.priority === 'high' ? '🔴 Высокий' : 
                             task.priority === 'medium' ? '🟡 Средний' : 
                             '🟢 Низкий'}
                          </span>
                        </div>
                        
                        {task.description && (
                          <p className={cn("text-sm mb-2", themeClasses.text.muted)}>
                            {task.description}
                          </p>
                        )}
                        
                        <div className="flex items-center space-x-4 text-xs">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span className={cn(
                              isOverdue ? "text-red-600 dark:text-red-400 font-medium" : themeClasses.text.muted
                            )}>
                              {new Date(task.due_date).toLocaleString('ru-RU')}
                              {isOverdue && ' (Просрочено)'}
                            </span>
                          </div>
                          
                          {task.assigned_to_name && (
                            <div className="flex items-center space-x-1">
                              <User className="w-3 h-3" />
                              <span className={themeClasses.text.muted}>{task.assigned_to_name}</span>
                            </div>
                          )}
                          
                          {task.lead_name && (
                            <div className="flex items-center space-x-1">
                              <FileText className="w-3 h-3" />
                              <span className={themeClasses.text.muted}>Заявка: {task.lead_name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Действия */}
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setEditingTask(task);
                            setNewTask({
                              title: task.title,
                              description: task.description || '',
                              priority: task.priority,
                              due_date: task.due_date,
                              type: task.type,
                              lead_id: task.lead_id || ''
                            });
                            setShowCreateModal(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Модальное окно создания/редактирования */}
      <Modal
        show={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingTask(null);
          setNewTask({
            title: '',
            description: '',
            priority: 'medium',
            due_date: '',
            type: 'call',
            lead_id: ''
          });
        }}
        title={editingTask ? 'Редактировать задачу' : 'Новая задача'}
        size="max-w-md"
      >
        <form onSubmit={handleSaveTask} className="space-y-4">
          <div>
            <label className={labelClasses}>Название *</label>
            <input
              type="text"
              value={newTask.title}
              onChange={(e) => setNewTask({...newTask, title: e.target.value})}
              className={inputClasses}
              placeholder="Название задачи"
              required
            />
          </div>
          
          <div>
            <label className={labelClasses}>Тип задачи</label>
            <select
              value={newTask.type}
              onChange={(e) => setNewTask({...newTask, type: e.target.value})}
              className={selectClasses}
            >
              {Object.entries(taskTypes).map(([key, type]) => (
                <option key={key} value={key}>{type.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className={labelClasses}>Описание</label>
            <textarea
              value={newTask.description}
              onChange={(e) => setNewTask({...newTask, description: e.target.value})}
              className={inputClasses}
              rows="3"
              placeholder="Описание задачи..."
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Приоритет</label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
                className={selectClasses}
              >
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
              </select>
            </div>
            
            <div>
              <label className={labelClasses}>Срок выполнения</label>
              <input
                type="datetime-local"
                value={newTask.due_date}
                onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
                className={inputClasses}
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false);
                setEditingTask(null);
              }}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {editingTask ? 'Обновить' : 'Создать'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TasksView;
