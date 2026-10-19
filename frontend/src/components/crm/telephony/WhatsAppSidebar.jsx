import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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

  return createPortal(
    <div 
      className="curai-surface-root flex flex-col bg-curai-surface shadow-none border-l border-curai-border overflow-hidden"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '384px',
        zIndex: 99999
      }}
    >
      {/* Шапка - фиксированная */}
      <div className="flex-shrink-0 bg-curai-positive p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💬</span>
            <h3 className="font-semibold text-lg">WhatsApp</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-md transition-colors"
          >
            <span className="text-xl">✖️</span>
          </button>
        </div>
        <div>
          <p className="text-sm font-medium">{patientName}</p>
          <p className="text-xs text-curai-positive">{phone}</p>
        </div>
      </div>

      {/* Статистика - фиксированная */}
      {totalCount > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-curai-subtle border-b border-curai-border text-sm">
          <div className="flex items-center justify-between text-curai-muted">
            <span>📊 Всего: <span className="font-semibold">{totalCount}</span></span>
            <button
              onClick={loadHistory}
              className="text-curai-blue hover:text-curai-blue"
              title="Обновить"
            >
              🔄
            </button>
          </div>
        </div>
      )}

      {/* Область сообщений - скроллируемая */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-curai-subtle">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin w-10 h-10 border-4 border-curai-positive border-t-transparent rounded-full"></div>
            <p className="mt-3 text-curai-muted text-sm">Загрузка...</p>
          </div>
        )}

        {error && (
          <div className="bg-curai-negativeBg border border-curai-negative rounded-md p-3">
            <div className="flex items-center gap-2 text-curai-negative text-sm">
              <span>⚠️</span>
              <span className="font-medium">Ошибка</span>
            </div>
            <p className="text-xs text-curai-negative mt-1">{error}</p>
            <button
              onClick={loadHistory}
              className="mt-2 bg-curai-negative text-white px-3 py-1 rounded text-xs hover:bg-curai-negative"
            >
              Повторить
            </button>
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-curai-muted">
            <span className="text-2xl mb-3">💬</span>
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
                    className={`max-w-[80%] rounded-md px-3 py-2 shadow-none ${
                      isOutgoing
                        ? "bg-curai-positive text-white rounded-br-none"
                        : "bg-curai-surface text-curai-ink border border-curai-border rounded-bl-none"
                    }`}
                  >
                    {/* Текст сообщения */}
                    {msg.text && (
                      <div className={`text-sm whitespace-pre-wrap break-words ${
                        isOutgoing ? 'text-white' : "text-curai-ink"
                      }`}>
                        {msg.text}
                      </div>
                    )}

                    {/* Время и статус */}
                    <div className={`flex items-center justify-end gap-1 mt-1 text-xs ${
                      isOutgoing ? "text-curai-positive" : "text-curai-muted"
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

      {/* Статистика внизу - фиксированная */}
      <div className="flex-shrink-0 px-4 py-2 bg-curai-subtle border-t border-curai-border">
        <div className="flex items-center justify-between text-xs text-curai-muted">
          <span>📥 {messages.filter(m => !m.metadata?.from_me).length}</span>
          <span>📤 {messages.filter(m => m.metadata?.from_me).length}</span>
        </div>
      </div>

      {/* Поле ввода - фиксированное внизу */}
      <div className="flex-shrink-0 p-3 bg-curai-surface border-t border-curai-border">
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
            className="w-full px-3 py-2 border border-curai-control rounded-md resize-none focus:ring-2 focus:ring-curai-focus focus:border-transparent text-sm"
            rows="2"
          />
          <button
            onClick={handleSendMessage}
            disabled={sending || !newMessage.trim()}
            className="w-full px-4 py-2 bg-curai-positive text-white rounded-md hover:bg-curai-positive disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            {sending ? '📤 Отправка...' : '📲 Отправить'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WhatsAppSidebar;
