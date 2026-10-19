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
          ? "bg-curai-border text-curai-muted border-curai-control cursor-not-allowed"
          : isSelected 
            ? "bg-curai-blue text-white border-curai-control shadow-none"
            : "bg-curai-surface text-curai-ink border-curai-control hover:bg-curai-subtle hover:border-curai-control"
      }`}
      title={disabled ? 'Выберите услугу с единицей "зуб"' : `Зуб ${toothNumber} ${isSelected ? '(выбран)' : ''}`}
    >
      {toothNumber}
    </button>
  );

  return (
    <div className={`bg-curai-subtle p-4 rounded-md border ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-medium text-center flex-1">Стоматологическая карта</h4>
        {selectedTeeth.length > 0 && (
          <div className="text-sm text-curai-blue font-medium">
            Выбрано: {selectedTeeth.length} {selectedTeeth.length === 1 ? 'зуб' : 'зубов'}
          </div>
        )}
      </div>
      
      {multiSelect && !disabled && (
        <div className="text-xs text-curai-muted mb-3 text-center bg-curai-selected p-2 rounded">
          💡 Выберите зубы для лечения. Цена будет умножена на количество зубов.
        </div>
      )}
      
      {/* Upper jaw */}
      <div className="mb-4">
        <div className="text-sm text-curai-muted mb-2 text-center">Верхняя челюсть</div>
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
        <div className="w-16 h-8 border-2 border-curai-control rounded-md bg-curai-negativeBg flex items-center justify-center">
          <span className="text-xs text-curai-muted">👄</span>
        </div>
      </div>

      {/* Lower jaw */}
      <div className="mb-4">
        <div className="text-sm text-curai-muted mb-2 text-center">Нижняя челюсть</div>
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
        <div className="mt-4 p-3 bg-curai-surface rounded border">
          <div className="text-sm font-medium text-curai-ink mb-1">
            Выбранные зубы ({selectedTeeth.length}):
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedTeeth.sort((a, b) => parseInt(a) - parseInt(b)).map(tooth => (
              <span 
                key={tooth}
                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-curai-selected text-curai-blue"
              >
                #{tooth}
                {!disabled && (
                  <button
                    onClick={() => handleToothClick(tooth)}
                    className="ml-1 text-curai-blue hover:text-curai-blue"
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