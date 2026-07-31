import React, { useState, useRef, useEffect } from 'react';
import { useInsightsBadges } from '../../hooks/useInsightsBadges';

// Компонент для отображения содержимого сообщения с поддержкой iframe
const MessageContent = ({ content }) => {
  // Проверяем, содержит ли сообщение iframe тег
  const iframeTagMatch = content.match(/<iframe[^>]*src="([^"]*)"[^>]*><\/iframe>/);

  if (iframeTagMatch) {
    const iframeTag = iframeTagMatch[0];
    const iframeSrc = iframeTagMatch[1];
    const textContent = content.replace(iframeTag, '').trim();

    return (
      <div className="space-y-3">
        {textContent && <div className="text-sm whitespace-pre-wrap">{textContent}</div>}
        <div className="border rounded-lg overflow-hidden">
          <iframe
            src={iframeSrc}
            width="100%"
            height="300"
            frameBorder="0"
            allowTransparency="true"
            className="w-full"
            title="Metabase Dashboard"
          />
        </div>
      </div>
    );
  }

  // Также проверяем на случай, если URL указан без iframe тега
  const urlMatch = content.match(/(https?:\/\/[^\s]+\.embed\.question\.[^\s#]+#[^\s]*)/);
  if (urlMatch) {
    const url = urlMatch[1];
    const textContent = content.replace(url, '').trim();

    return (
      <div className="space-y-3">
        {textContent && <div className="text-sm whitespace-pre-wrap">{textContent}</div>}
        <div className="border rounded-lg overflow-hidden">
          <iframe
            src={url}
            width="100%"
            height="300"
            frameBorder="0"
            allowTransparency="true"
            className="w-full"
            title="Metabase Dashboard"
          />
        </div>
      </div>
    );
  }

  return <div className="text-sm whitespace-pre-wrap">{content}</div>;
};

const AIChatSidebar = ({ isOpen, onClose, badge, showMaterialForm = false, onMaterialSubmit }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Состояние для формы материала
  const [materialForm, setMaterialForm] = useState({
    name: '',
    unit: '',
    barcode: '',
    material_type: 'Материал',
    is_product: false,
    warehouses: [
      { warehouse_name: 'Склад по умолчанию', min_stock: 0 },
      { warehouse_name: 'Основной склад', min_stock: 0 }
    ]
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      // Инициализируем чат
      const initialMessage = {
        role: 'assistant',
        content: `Привет! Я ИИ-ассистент. Чем могу помочь? Расскажите подробнее о ситуации или задайте вопрос.`,
        timestamp: new Date()
      };
      setMessages([initialMessage]);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      console.log('Sending message to AI:', inputMessage);
      // API вызов к backend напрямую
      const response = await fetch('http://localhost:8001/api/chat/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          message: inputMessage,
          context: badge ? `Контекст: ${badge.title} - ${badge.description || ''}` : ''
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log('AI response received');
      const data = await response.json();

      const aiMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Извините, произошла ошибка при обработке вашего сообщения. Попробуйте еще раз.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Функции для формы материала
  const handleMaterialFormChange = (field, value) => {
    setMaterialForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleWarehouseChange = (index, value) => {
    setMaterialForm(prev => ({
      ...prev,
      warehouses: prev.warehouses.map((wh, idx) =>
        idx === index ? { ...wh, min_stock: value } : wh
      )
    }));
  };

  const handleMaterialSubmit = async (e) => {
    e.preventDefault();
    if (onMaterialSubmit) {
      await onMaterialSubmit(materialForm);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 h-full w-96 bg-white dark:bg-gray-800 shadow-xl z-40 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {showMaterialForm ? 'Добавить материал' : 'Чат с ИИ'}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content Area */}
      {showMaterialForm ? (
        /* Material Form */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
          <form onSubmit={handleMaterialSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Название *
              </label>
              <input
                type="text"
                value={materialForm.name}
                onChange={(e) => handleMaterialFormChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_product_sidebar"
                checked={materialForm.is_product}
                onChange={(e) => handleMaterialFormChange('is_product', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="is_product_sidebar" className="text-sm text-gray-600 dark:text-gray-300">Это товар</label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Единица измерения
                </label>
                <input
                  type="text"
                  value={materialForm.unit}
                  onChange={(e) => handleMaterialFormChange('unit', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="шт, кг, л и т.д."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Категория
                </label>
                <select
                  value={materialForm.material_type}
                  onChange={(e) => handleMaterialFormChange('material_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="Без категории">Без категории</option>
                  <option value="Материал">Материал</option>
                  <option value="Расходник">Расходник</option>
                  <option value="Инструмент">Инструмент</option>
                  <option value="Медикамент">Медикамент</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Штрих-код
              </label>
              <input
                type="text"
                value={materialForm.barcode}
                onChange={(e) => handleMaterialFormChange('barcode', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Если имеется"
              />
            </div>

            <details className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <summary className="cursor-pointer px-4 py-3 font-medium text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">
                Минимальные остатки
              </summary>
              <div className="px-4 pb-4 pt-2 space-y-3">
                {materialForm.warehouses.map((warehouse, index) => (
                  <div key={warehouse.warehouse_name} className="grid grid-cols-2 gap-3 items-center">
                    <label className="text-sm text-gray-600 dark:text-gray-400">
                      {warehouse.warehouse_name}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={warehouse.min_stock}
                      onChange={(e) => handleWarehouseChange(index, e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </details>
          </form>
        </div>
      ) : (
        /* Messages Area */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              <MessageContent content={message.content} />
              <p className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-700 px-3 py-2 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 dark:border-white"></div>
                <span className="text-sm text-gray-500 dark:text-gray-300">ИИ думает...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input Area - показывать только для чата */}
      {!showMaterialForm && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Введите сообщение..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Отправить
            </button>
          </div>
        </div>
      )}

      {/* Form Buttons - показывать только для формы */}
      {showMaterialForm && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-3">
            <button
              type="submit"
              onClick={handleMaterialSubmit}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIChatSidebar;
