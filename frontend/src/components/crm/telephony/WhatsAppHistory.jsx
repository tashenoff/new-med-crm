import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../../api/config';

const WhatsAppHistory = ({ phone, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (phone) {
      loadHistory();
    }
  }, [phone]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE_URL}/wazzup/messages/history/${phone}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          params: {
            limit: 50
          }
        }
      );

      setMessages(response.data.messages || []);
      setTotalCount(response.data.total_count || 0);
    } catch (err) {
      console.error('Ошибка загрузки истории:', err);
      setError(err.response?.data?.detail || 'Не удалось загрузить историю сообщений');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Сегодня в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  return (
    <div className="bg-curai-surface rounded-md shadow-none border border-curai-border max-w-4xl w-full max-h-[80vh] flex flex-col">
      {/* Заголовок */}
      <div className="flex items-center justify-between p-4 border-b border-curai-border bg-curai-positiveBg ">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-curai-positive rounded-full flex items-center justify-center">
            <span className="text-white text-xl">💬</span>
          </div>
          <div>
            <h3 className="font-semibold text-curai-ink">История WhatsApp</h3>
            <p className="text-sm text-curai-muted">{phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadHistory}
            className="p-2 hover:bg-curai-positiveBg rounded-md transition-colors"
            title="Обновить"
          >
            <span className="text-xl">🔄</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-curai-negativeBg rounded-md transition-colors"
          >
            <span className="text-xl">✖️</span>
          </button>
        </div>
      </div>

      {/* Счетчик сообщений */}
      {totalCount > 0 && (
        <div className="px-4 py-2 bg-curai-subtle border-b border-curai-border">
          <p className="text-sm text-curai-muted">
            📊 Всего сообщений в базе: <span className="font-semibold">{totalCount}</span>
          </p>
        </div>
      )}

      {/* Область сообщений */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-curai-subtle">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin w-12 h-12 border-4 border-curai-positive border-t-transparent rounded-full"></div>
            <p className="mt-4 text-curai-muted">Загрузка истории...</p>
          </div>
        )}

        {error && (
          <div className="bg-curai-negativeBg border border-curai-negative rounded-md p-4">
            <div className="flex items-center gap-2 text-curai-negative">
              <span>⚠️</span>
              <span className="font-medium">Ошибка загрузки</span>
            </div>
            <p className="text-sm text-curai-negative mt-1">{error}</p>
            <button
              onClick={loadHistory}
              className="mt-3 bg-curai-negative text-white px-4 py-2 rounded-md text-sm hover:bg-curai-negative"
            >
              Повторить
            </button>
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-curai-muted">
            <span className="text-6xl mb-4">💬</span>
            <p className="text-lg font-medium">История сообщений пуста</p>
            <p className="text-sm mt-1">Отправьте первое сообщение клиенту</p>
          </div>
        )}

        {!loading && !error && messages.length > 0 && (
          <div className="space-y-3">
            {messages.map((msg, index) => {
              const isOutgoing = msg.metadata?.from_me;
              const contactName = msg.metadata?.contact_name;

              return (
                <div
                  key={index}
                  className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-md p-3 shadow-none ${
                      isOutgoing
                        ? "bg-curai-positive text-white"
                        : "bg-curai-surface text-curai-ink border border-curai-border"
                    }`}
                  >
                    {/* Имя отправителя для входящих */}
                    {!isOutgoing && contactName && (
                      <div className="text-xs font-semibold text-curai-positive mb-1">
                        {contactName}
                      </div>
                    )}

                    {/* Текст сообщения */}
                    {msg.text && (
                      <div className={`text-sm whitespace-pre-wrap break-words ${
                        isOutgoing ? 'text-white' : "text-curai-ink"
                      }`}>
                        {msg.text}
                      </div>
                    )}

                    {/* Медиа */}
                    {msg.media_url && (
                      <div className="mt-2">
                        {msg.message_type === 'image' && (
                          <img 
                            src={msg.media_url} 
                            alt="Изображение" 
                            className="max-w-full rounded"
                          />
                        )}
                        {msg.message_type !== 'image' && (
                          <a 
                            href={msg.media_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={`text-sm underline ${
                              isOutgoing ? 'text-white' : "text-curai-blue"
                            }`}
                          >
                            📎 Вложение
                          </a>
                        )}
                      </div>
                    )}

                    {/* Время и статус */}
                    <div className={`flex items-center gap-2 mt-1 text-xs ${
                      isOutgoing ? "text-curai-positive" : "text-curai-muted"
                    }`}>
                      <span>{formatDate(msg.sent_at)}</span>
                      {isOutgoing && (
                        <span>
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

      {/* Футер с информацией */}
      <div className="p-3 border-t border-curai-border bg-curai-surface">
        <div className="flex items-center justify-between text-sm text-curai-muted">
          <div className="flex items-center gap-4">
            <span>📥 Входящих: {messages.filter(m => !m.metadata?.from_me).length}</span>
            <span>📤 Исходящих: {messages.filter(m => m.metadata?.from_me).length}</span>
          </div>
          <span className="text-xs text-curai-muted">
            История хранится в MongoDB
          </span>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppHistory;
