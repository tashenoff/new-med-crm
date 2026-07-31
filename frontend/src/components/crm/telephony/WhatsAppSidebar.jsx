import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../../api/config';

const WhatsAppSidebar = ({ phone, patientName, isOpen, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen && phone) {
      loadHistory();
    }
  }, [isOpen, phone]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/wazzup/messages/history/${phone}?limit=50`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setTotalCount(data.total_count || 0);
      } else {
        throw new Error('Не удалось загрузить историю');
      }
    } catch (err) {
      console.error('Ошибка загрузки истории:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/wazzup/messages/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: phone,
          text: newMessage
        })
      });

      if (response.ok) {
        setNewMessage('');
        // Обновляем историю после отправки
        setTimeout(() => loadHistory(), 500);
      } else {
        const errorData = await response.json();
        alert(`Ошибка: ${errorData.detail || 'Не удалось отправить сообщение'}`);
      }
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      alert(`Ошибка: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Вчера, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-screen w-96 bg-white shadow-2xl border-l border-gray-200 flex flex-col z-50 animate-slide-in">
      {/* Шапка */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💬</span>
            <h3 className="font-semibold text-lg">WhatsApp</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
          >
            <span className="text-xl">✖️</span>
          </button>
        </div>
        <div>
          <p className="text-sm font-medium">{patientName}</p>
          <p className="text-xs text-green-100">{phone}</p>
        </div>
      </div>

      {/* Статистика */}
      {totalCount > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm">
          <div className="flex items-center justify-between text-gray-600">
            <span>📊 Всего: <span className="font-semibold">{totalCount}</span></span>
            <button
              onClick={loadHistory}
              className="text-blue-600 hover:text-blue-800"
              title="Обновить"
            >
              🔄
            </button>
          </div>
        </div>
      )}

      {/* Область сообщений */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full"></div>
            <p className="mt-3 text-gray-600 text-sm">Загрузка...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-800 text-sm">
              <span>⚠️</span>
              <span className="font-medium">Ошибка</span>
            </div>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <button
              onClick={loadHistory}
              className="mt-2 bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700"
            >
              Повторить
            </button>
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <span className="text-5xl mb-3">💬</span>
            <p className="text-sm font-medium">История пуста</p>
            <p className="text-xs mt-1">Отправьте первое сообщение</p>
          </div>
        )}

        {!loading && !error && messages.length > 0 && (
          <div className="space-y-2">
            {messages.map((msg, index) => {
              const isOutgoing = msg.metadata?.from_me;

              return (
                <div
                  key={index}
                  className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${
                      isOutgoing
                        ? 'bg-green-500 text-white rounded-br-none'
                        : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none'
                    }`}
                  >
                    {/* Текст сообщения */}
                    {msg.text && (
                      <div className={`text-sm whitespace-pre-wrap break-words ${
                        isOutgoing ? 'text-white' : 'text-gray-900'
                      }`}>
                        {msg.text}
                      </div>
                    )}

                    {/* Время и статус */}
                    <div className={`flex items-center justify-end gap-1 mt-1 text-xs ${
                      isOutgoing ? 'text-green-100' : 'text-gray-500'
                    }`}>
                      <span>{formatDate(msg.sent_at)}</span>
                      {isOutgoing && (
                        <span className="ml-1">
                          {msg.status === 'read' && '✓✓'}
                          {msg.status === 'delivered' && '✓✓'}
                          {msg.status === 'sent' && '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Статистика внизу */}
      <div className="px-4 py-2 bg-gray-100 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>📥 {messages.filter(m => !m.metadata?.from_me).length}</span>
          <span>📤 {messages.filter(m => m.metadata?.from_me).length}</span>
        </div>
      </div>

      {/* Поле ввода */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex flex-col gap-2">
          <textarea
            placeholder="Введите сообщение..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
            rows="3"
          />
          <button
            onClick={handleSendMessage}
            disabled={sending || !newMessage.trim()}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            {sending ? '📤 Отправка...' : '📲 Отправить'}
          </button>
          <p className="text-xs text-gray-400 text-center">
            Через Wazzup24 API
          </p>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppSidebar;
