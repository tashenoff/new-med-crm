import React from 'react';

const ToothChart = ({ selectedTooth, onToothSelect }) => {
  const upperTeeth = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
  const lowerTeeth = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];

  const handleToothClick = (toothNumber) => {
    if (onToothSelect) {
      onToothSelect(toothNumber);
    }
  };

  const ToothButton = ({ toothNumber, isSelected }) => (
    <button
      type="button"
      onClick={() => handleToothClick(toothNumber)}
      className={`w-8 h-12 border-2 rounded text-xs font-medium transition-colors ${
        isSelected 
          ? 'bg-blue-500 text-white border-blue-600' 
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {toothNumber}
    </button>
  );

  return (
    <div className="bg-gray-50 p-4 rounded-lg border">
      <h4 className="font-medium mb-3 text-center">Стоматологическая карта</h4>
      
      {/* Upper jaw */}
      <div className="mb-4">
        <div className="text-sm text-gray-600 mb-2 text-center">Верхняя челюсть</div>
        <div className="flex justify-center gap-1">
          {upperTeeth.map(tooth => (
            <ToothButton 
              key={tooth} 
              toothNumber={tooth} 
              isSelected={selectedTooth === tooth}
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
      <div>
        <div className="text-sm text-gray-600 mb-2 text-center">Нижняя челюсть</div>
        <div className="flex justify-center gap-1">
          {lowerTeeth.map(tooth => (
            <ToothButton 
              key={tooth} 
              toothNumber={tooth} 
              isSelected={selectedTooth === tooth}
            />
          ))}
        </div>
      </div>

      {selectedTooth && (
        <div className="mt-4 p-2 bg-blue-50 rounded text-center">
          <span className="text-sm font-medium text-blue-800">
            Выбран зуб: {selectedTooth}
          </span>
        </div>
      )}
    </div>
  );
};

export default ToothChart;