import React, { useState, useEffect } from 'react';
import ToothChart from '../dental/ToothChart';

const ServiceSelector = ({ onServiceAdd, selectedPatient }) => {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedTeeth, setSelectedTeeth] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      fetchServices(selectedCategory);
    }
  }, [selectedCategory]);

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // API возвращает массив объектов ServiceCategory [{id, name, ...}]
        const categoryNames = data.map(cat => cat.name);
        setCategories(categoryNames);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchServices = async (category) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-prices?category=${encodeURIComponent(category)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Преобразуем данные из справочника цен в формат услуг
        const transformedServices = data.map(servicePrice => ({
          id: servicePrice.id,
          name: servicePrice.service_name,
          code: servicePrice.service_code || '',
          category: servicePrice.category,
          price: servicePrice.price,
          unit: servicePrice.unit || 'процедура',
          description: servicePrice.description || ''
        }));
        
        setServices(transformedServices);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const selectedServiceData = services.find(s => s.id === selectedService);
  const isToothService = selectedServiceData?.unit === 'зуб';
  const finalQuantity = isToothService ? selectedTeeth.length : quantity;
  
  // Безопасный расчет цены с проверками на undefined
  const basePrice = selectedServiceData?.price || 0;
  const safeQuantity = finalQuantity || 1;
  const safeDiscount = discount || 0;
  const totalPrice = basePrice * safeQuantity * (1 - safeDiscount / 100);

  const handleAddService = () => {
    if (!selectedService) return;
    
    const service = services.find(s => s.id === selectedService);
    if (!service) return;

    // Проверка на выбор зубов для услуг по зубам
    if (isToothService && selectedTeeth.length === 0) {
      alert('Выберите зубы для данной услуги');
      return;
    }

    const serviceToAdd = {
      service_id: service.id,
      service_name: service.name,
      category: service.category,
      unit: service.unit,
      teeth_numbers: isToothService ? selectedTeeth : null,
      unit_price: service.price || 0,
      price: service.price || 0, // Добавляем поле price для совместимости с расчетом зарплат
      quantity: finalQuantity || 1,
      discount: discount || 0, // Исправляем название поля
      total_price: totalPrice || 0,
      description: service.description || ''
    };

    onServiceAdd(serviceToAdd);

    // Reset form
    setSelectedService('');
    setSelectedTeeth([]);
    setQuantity(1);
    setDiscount(0);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Категория услуг</label>
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedService('');
              setSelectedTeeth([]);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Выберите категорию</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Услуга</label>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={!selectedCategory}
          >
            <option value="">Выберите услугу</option>
            {services.map(service => (
              <option key={service.id} value={service.id}>
                {service.name} - {service.price} ₸
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tooth chart for dental services */}
      {isToothService && (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            🦷 Выбор зубов для услуги: <span className="font-medium">{selectedServiceData.name}</span>
          </div>
          <ToothChart 
            selectedTeeth={selectedTeeth}
            onTeethSelect={setSelectedTeeth}
            multiSelect={true}
            disabled={false}
          />
          {selectedTeeth.length > 0 && (
            <div className="text-sm text-green-600">
              Выбрано зубов: {selectedTeeth.join(', ')} (всего: {selectedTeeth.length})
            </div>
          )}
        </div>
      )}

      {/* Service details and quantity */}
      {selectedServiceData && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h5 className="font-medium text-blue-800 mb-2 flex items-center">
            {selectedServiceData.name}
            {isToothService && (
              <span className="ml-2 px-2 py-1 bg-blue-200 text-blue-700 text-xs rounded-full">
                🦷 по зубам
              </span>
            )}
          </h5>
          
          {isToothService && (
            <div className="mb-3 p-2 bg-blue-100 rounded text-sm text-blue-700">
              💡 Для этой услуги выберите зубы на карте ниже. Цена будет рассчитана за каждый зуб: {selectedServiceData.price}₸ × количество зубов
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {isToothService ? 'Количество (зубы)' : 'Количество'}
              </label>
              <input
                type="number"
                min="1"
                value={isToothService ? finalQuantity : quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                disabled={isToothService}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm ${isToothService ? 'bg-gray-100' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Скидка (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Итого</label>
              <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium">
                {(totalPrice || 0).toFixed(0)} ₸
              </div>
            </div>
          </div>
          
          <button
            type="button"
            onClick={handleAddService}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Добавить в план
          </button>
        </div>
      )}
    </div>
  );
};

export default ServiceSelector;
