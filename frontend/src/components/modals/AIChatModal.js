import React, { useState, useRef, useEffect } from 'react';
import Modal from './Modal';
import { apiClient } from '../../api/config';

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
            height="400"
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
  // Ищем любой URL, содержащий "localhost:3000/embed/question"
  const urlMatch = content.match(/(https?:\/\/[^\s]*localhost:3000\/embed\/question\/[^\s"',}\]]+)/);
  if (urlMatch) {
    const url = urlMatch[1];
    const textContent = content.replace(url, '').trim();
    
    console.log('Found Metabase URL:', url);

    return (
      <div className="space-y-3">
        {textContent && <div className="text-sm whitespace-pre-wrap">{textContent}</div>}
        <div className="border rounded-lg overflow-hidden">
          <iframe
            src={url}
            width="100%"
            height="600"
            frameBorder="0"
            allowTransparency="true"
            className="w-full"
            title="Metabase Dashboard"
          />
        </div>
      </div>
    );
  }
  
  console.log('No Metabase URL found in content:', content);

  return <div className="text-sm whitespace-pre-wrap">{content}</div>;
};

const AIChatModal = ({ show, onClose, badge }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (show && badge) {
      // Инициализируем чат с контекстом бейджа
      const initialMessage = {
        role: 'assistant',
        content: `Привет! Я ИИ-ассистент. Вы кликнули на сигнал "${badge.title}". Чем могу помочь? Расскажите подробнее о ситуации или задайте вопрос.`,
        timestamp: new Date()
      };
      setMessages([initialMessage]);
    }
  }, [show, badge]);

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

  return (
    <Modal show={show} onClose={onClose} title="Чат с ИИ" size="lg">
      <div className="flex flex-col h-96">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-2xl px-4 py-2 rounded-lg ${
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
              <div className="bg-white dark:bg-gray-700 px-4 py-2 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 dark:border-white"></div>
                  <span className="text-sm text-gray-500 dark:text-gray-300">ИИ думает...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="mt-4 flex space-x-2">
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
    </Modal>
  );
};

export default AIChatModal;
