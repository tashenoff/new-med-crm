import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

// Hook для использования контекста
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Helper function to check if error is password expired
const isPasswordExpiredError = (error) => {
  return error.response?.status === 401 &&
         error.response?.data?.detail === 'Password expired';
};

// Auth Provider
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [showPasswordExpiredModal, setShowPasswordExpiredModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);

      // Если пользователь на корневой странице, перенаправляем на календарь
      if (window.location.pathname === '/') {
        navigate('/calendar');
      }
    } catch (error) {
      console.error('Failed to fetch current user:', error);

      // Check if password is expired
      if (isPasswordExpiredError(error)) {
        setShowPasswordExpiredModal(true);
        setUser({ email: error.config?.headers?.Authorization ? 'user' : null }); // Keep minimal user info
      } else {
        logout();
      }
    }
    setLoading(false);
  };

  const login = async (email, password, rememberMe = false) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { 
        email, 
        password,
        remember_me: rememberMe 
      });
      const { access_token, user: userData } = response.data;
      
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      // Автоматический переход на календарь после входа
      navigate('/calendar');
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Ошибка входа' 
      };
    }
  };

  const register = async (email, password, fullName, role = 'patient') => {
    try {
      const response = await axios.post(`${API}/auth/register`, {
        email,
        password,
        full_name: fullName,
        role
      });
      const { access_token, user: userData } = response.data;
      
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Ошибка регистрации' 
      };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  const handlePasswordChanged = () => {
    setShowPasswordExpiredModal(false);
    // Re-fetch user data to get updated info
    fetchCurrentUser();
  };

  const value = {
    user,
    token,
    login,
    register,
    logout,
    loading,
    showPasswordExpiredModal,
    handlePasswordChanged
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
