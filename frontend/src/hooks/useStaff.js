import { useState, useCallback } from 'react';

export const useStaff = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const API = import.meta.env.VITE_BACKEND_URL;

  // Получить список всего персонала (включая врачей) - НОВЫЙ МЕТОД
  const fetchAllPersonnel = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/personnel/all`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка при загрузке списка персонала');
      }

      const data = await response.json();
      setStaff(data);
      return { success: true, data };
    } catch (err) {
      console.error('Error fetching personnel:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [API]);

  // Получить список персонала (без врачей) - СТАРЫЙ МЕТОД для совместимости
  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка при загрузке списка персонала');
      }

      const data = await response.json();
      setStaff(data);
      return { success: true, data };
    } catch (err) {
      console.error('Error fetching staff:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [API]);

  // Получить информацию о конкретном сотруднике
  const fetchStaffMember = useCallback(async (staffId) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/${staffId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка при загрузке данных сотрудника');
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      console.error('Error fetching staff member:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [API]);

  // Создать нового сотрудника
  const createStaffMember = useCallback(async (staffData) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(staffData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка при создании сотрудника');
      }

      const data = await response.json();
      
      // Обновляем список персонала
      await fetchAllPersonnel();
      
      return { success: true, data };
    } catch (err) {
      console.error('Error creating staff member:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [API, fetchAllPersonnel]);

  // Обновить данные сотрудника
  const updateStaffMember = useCallback(async (staffId, staffData) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/${staffId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(staffData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка при обновлении данных сотрудника');
      }

      const data = await response.json();
      
      // Обновляем список персонала
      await fetchAllPersonnel();
      
      return { success: true, data };
    } catch (err) {
      console.error('Error updating staff member:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [API, fetchAllPersonnel]);

  // Удалить сотрудника
  const deleteStaffMember = useCallback(async (staffId) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/${staffId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка при удалении сотрудника');
      }

      // Обновляем список персонала
      await fetchAllPersonnel();
      
      return { success: true };
    } catch (err) {
      console.error('Error deleting staff member:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [API, fetchAllPersonnel]);

  // Получить права сотрудника
  const fetchStaffPermissions = useCallback(async (staffId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/${staffId}/permissions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка при загрузке прав сотрудника');
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      console.error('Error fetching staff permissions:', err);
      return { success: false, error: err.message };
    }
  }, [API]);

  // Получить права для роли
  const fetchRolePermissions = useCallback(async (role) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/roles/permissions/${role}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка при загрузке прав роли');
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      console.error('Error fetching role permissions:', err);
      return { success: false, error: err.message };
    }
  }, [API]);

  // НОВЫЙ: Назначить доступ врачу
  const assignAccessToDoctor = useCallback(async (doctorId, email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/doctors/${doctorId}/assign-access?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка при назначении доступа');
      }

      const data = await response.json();
      
      // Обновляем список персонала
      await fetchAllPersonnel();
      
      return { success: true, data: data.data };
    } catch (err) {
      console.error('Error assigning access to doctor:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [API, fetchAllPersonnel]);

  // НОВЫЙ: Отозвать доступ врача
  const revokeDoctorAccess = useCallback(async (doctorId) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/staff/doctors/${doctorId}/revoke-access`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка при отзыве доступа');
      }

      // Обновляем список персонала
      await fetchAllPersonnel();
      
      return { success: true };
    } catch (err) {
      console.error('Error revoking doctor access:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [API, fetchAllPersonnel]);

  return {
    staff,
    loading,
    error,
    fetchStaff,
    fetchAllPersonnel, // НОВЫЙ
    fetchStaffMember,
    createStaffMember,
    updateStaffMember,
    deleteStaffMember,
    fetchStaffPermissions,
    fetchRolePermissions,
    assignAccessToDoctor, // НОВЫЙ
    revokeDoctorAccess // НОВЫЙ
  };
};
