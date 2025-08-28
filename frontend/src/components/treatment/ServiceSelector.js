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

  const API = process.env.REACT_APP_BACKEND_URL;

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
      const response = await fetch(`${API}/api/service-prices/categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
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

  const handleAddService = () => {
    if (!selectedService) return;

    const service = services.find(s => s.id === selectedService);
    if (!service) return;

    // Check if tooth is required for dental services
    if (selectedCategory === 'Стоматолог' && selectedTeeth.length === 0) {
      alert('Выберите зуб для стоматологической услуги');
      return;
    }

    const serviceItem = {
      service_id: service.id,
      service_name: service.name,
      category: service.category,
      tooth_number: selectedCategory === 'Стоматолог' ? selectedTeeth : null,
      unit_price: service.price,
      quantity: quantity,
      discount_percent: discount,
      total_price: (service.price * quantity) * (1 - discount / 100)
    };

    if (onServiceAdd) {
      onServiceAdd(serviceItem);
    }

    // Reset form
    setSelectedService('');
    setSelectedTeeth([]);
    setQuantity(1);
    setDiscount(0);
  };

  const selectedServiceData = services.find(s => s.id === selectedService);

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
              setSelectedTooth('');
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
      {selectedCategory === 'Стоматолог' && (
        <ToothChart 
          selectedTooth={selectedTooth}
          onToothSelect={setSelectedTooth}
        />
      )}

      {/* Service details and quantity */}
      {selectedServiceData && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h5 className="font-medium text-blue-800 mb-2">{selectedServiceData.name}</h5>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Количество</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                {((selectedServiceData.price * quantity) * (1 - discount / 100)).toFixed(0)} ₸
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