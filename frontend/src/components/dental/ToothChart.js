import React from 'react';

const ToothChart = ({ selectedTeeth = [], onTeethSelect, multiSelect = false, disabled = false }) => {
  const upperTeeth = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
  const lowerTeeth = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];

  const handleToothClick = (toothNumber) => {
    if (disabled || !onTeethSelect) return;
    
    if (multiSelect) {
      // Множественный выбор зубов
      const isSelected = selectedTeeth.includes(toothNumber);
      let newSelection;
      
      if (isSelected) {
        // Убираем зуб из выбранных
        newSelection = selectedTeeth.filter(tooth => tooth !== toothNumber);
      } else {
        // Добавляем зуб к выбранным
        newSelection = [...selectedTeeth, toothNumber];
      }
      
      onTeethSelect(newSelection);
    } else {
      // Одиночный выбор (старое поведение)
      const isSelected = selectedTeeth.includes(toothNumber);
      const newSelection = isSelected ? [] : [toothNumber];
      onTeethSelect(newSelection);
    }
  };

  const ToothButton = ({ toothNumber, isSelected }) => (
    <button
      type="button"
      onClick={() => handleToothClick(toothNumber)}
      disabled={disabled}
      className={`w-8 h-12 border-2 rounded text-xs font-medium transition-colors ${
        disabled 
          ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'
          : isSelected 
            ? 'bg-blue-500 text-white border-blue-600 shadow-md' 
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
      }`}
      title={disabled ? 'Выберите услугу с единицей "зуб"' : `Зуб ${toothNumber} ${isSelected ? '(выбран)' : ''}`}
    >
      {toothNumber}
    </button>
  );

  return (
    <div className={`bg-gray-50 p-4 rounded-lg border ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-medium text-center flex-1">Стоматологическая карта</h4>
        {selectedTeeth.length > 0 && (
          <div className="text-sm text-blue-600 font-medium">
            Выбрано: {selectedTeeth.length} {selectedTeeth.length === 1 ? 'зуб' : 'зубов'}
          </div>
        )}
      </div>
      
      {multiSelect && !disabled && (
        <div className="text-xs text-gray-600 mb-3 text-center bg-blue-50 p-2 rounded">
          💡 Выберите зубы для лечения. Цена будет умножена на количество зубов.
        </div>
      )}
      
      {/* Upper jaw */}
      <div className="mb-4">
        <div className="text-sm text-gray-600 mb-2 text-center">Верхняя челюсть</div>
        <div className="flex justify-center gap-1 flex-wrap">
          {upperTeeth.map(tooth => (
            <ToothButton 
              key={tooth} 
              toothNumber={tooth} 
              isSelected={selectedTeeth.includes(tooth)}
            />
          ))}
        </div>
      </div>

      {/* Gap between jaws */}
      <div className="flex justify-center my-4">
        <div className="w-16 h-8 border-2 border-gray-300 rounded-lg bg-pink-100 flex items-center justify-center">
          <span className="text-xs text-gray-500">👄</span>
        </div>
      </div>

      {/* Lower jaw */}
      <div className="mb-4">
        <div className="text-sm text-gray-600 mb-2 text-center">Нижняя челюсть</div>
        <div className="flex justify-center gap-1 flex-wrap">
          {lowerTeeth.map(tooth => (
            <ToothButton 
              key={tooth} 
              toothNumber={tooth} 
              isSelected={selectedTeeth.includes(tooth)}
            />
          ))}
        </div>
      </div>
      
      {/* Selected teeth summary */}
      {selectedTeeth.length > 0 && (
        <div className="mt-4 p-3 bg-white rounded border">
          <div className="text-sm font-medium text-gray-700 mb-1">
            Выбранные зубы ({selectedTeeth.length}):
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedTeeth.sort((a, b) => parseInt(a) - parseInt(b)).map(tooth => (
              <span 
                key={tooth}
                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800"
              >
                #{tooth}
                {!disabled && (
                  <button
                    onClick={() => handleToothClick(tooth)}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                    title="Убрать зуб"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToothChart;