import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Компонент карточки записи
 * @param {Object} props
 * @param {Object} props.appointment - Данные записи
 * @param {Object} props.patient - Данные пациента
 * @param {Object} props.doctor - Данные врача
 * @param {number} props.height - Высота карточки в пикселях
 * @param {string} props.statusColor - CSS класс цвета статуса
 * @param {boolean} props.canEdit - Можно ли редактировать
 * @param {Function} props.onEdit - Обработчик редактирования
 * @param {Function} props.onDragStart - Обработчик начала перетаскивания
 * @param {Function} props.onStatusChange - Обработчик смены статуса
 */
const AppointmentCard = ({
  appointment,
  patient,
  doctor,
  height,
  statusColor, // Оставляем для обратной совместимости, но не используем
  canEdit,
  onEdit,
  onDragStart,
  onDragEnd,
  onStatusChange
}) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusIconRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false });

  // Закрывать меню при клике вне
  useEffect(() => {
    if (!showStatusMenu) return;
    const handleClickOutside = (e) => {
      if (statusIconRef.current && !statusIconRef.current.contains(e.target)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStatusMenu]);

  // При открытом меню фиксируем позицию меню у карточки и блокируем скролл
  useEffect(() => {
    if (!showStatusMenu) return;

    // Блокируем скролл страницы и внутренних контейнеров
    const originalOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Сохраняем текущую позицию прокрутки, чтобы body не "прыгал"
    const scrollY = window.scrollY;

    // Блокируем колесо мыши и тач на всех элементах
    const preventScroll = (e) => e.preventDefault();
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });

    const handleScroll = () => {
      if (statusIconRef.current) {
        const rect = statusIconRef.current.getBoundingClientRect();
        const menuHeight = 260;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = (spaceBelow < menuHeight && spaceAbove > 100) || spaceAbove > spaceBelow;
        setMenuPosition({
          top: openUpward ? Math.max(8, rect.top - menuHeight + 20) : rect.bottom + 4,
          right: window.innerWidth - rect.right,
          openUpward
        });
      }
    };
    // Слушаем скролл у всех scrollable-родителей и окна (capture) — для пересчёта позиции
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
      window.scrollTo(0, scrollY);
    };
  }, [showStatusMenu]);

  // Получаем цвет календаря врача (fallback на appointment.doctor_color с бэкенда)
  const doctorColor = doctor?.calendar_color || appointment.doctor_color || '#3B82F6';
  
  // Получаем имена с fallback на данные из appointment (бэкенд возвращает patient_name/doctor_name)
  const patientName = patient?.full_name || appointment.patient_name || 'Загрузка...';
  const doctorName = doctor?.full_name || appointment.doctor_name || 'Загрузка...';

  // Возможные статусы
  const STATUSES = [
    { value: 'unconfirmed', label: 'Не подтверждено', color: 'bg-yellow-400' },
    { value: 'confirmed', label: 'Подтверждено', color: 'bg-green-500' },
    { value: 'arrived', label: 'Пришел', color: 'bg-blue-500' },
    { value: 'in_progress', label: 'На приеме', color: 'bg-indigo-500' },
    { value: 'completed', label: 'Завершен', color: 'bg-gray-500' },
    { value: 'cancelled', label: 'Отменен', color: 'bg-red-500' },
    { value: 'no_show', label: 'Не явился', color: 'bg-orange-500' }
  ];

  const getStatusDot = (status) => {
    const s = STATUSES.find(s => s.value === status);
    return s?.color || 'bg-gray-300';
  };

  const getStatusLabel = (status) => {
    const s = STATUSES.find(s => s.value === status);
    return s?.label || status;
  };

  const handleStatusSelect = (e, newStatus) => {
    e.stopPropagation();
    setShowStatusMenu(false);
    const id = appointment._id || appointment.id;
    console.log('📌 Статус выбран:', { id, newStatus, hasCallback: !!onStatusChange });
    if (onStatusChange && id) {
      onStatusChange(id, newStatus);
    }
  };

  // Конвертируем hex в rgba с прозрачностью для фона
  const hexToRgba = (hex, alpha = 0.15) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Вычисляем цвет текста на основе яркости фона
  const getTextColor = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#1F2937' : '#FFFFFF';
  };
  const handleDragStart = (e) => {
    console.log(` DRAG START: appointmentId=${appointment._id || appointment.id}, patient=${patient?.name}`);

    // Настраиваем drag операцию
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData('text/plain', ''); // Для совместимости

    if (onDragStart) {
      onDragStart(e, appointment._id || appointment.id);
    }
  };

  const handleDragEnd = (e) => {
    console.log(` DRAG END: appointmentId=${appointment._id || appointment.id}, patient=${patient?.name}, dropEffect=${e.dataTransfer.dropEffect}`);

    if (onDragEnd) {
      onDragEnd(e);
    }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(appointment);
    }
  };

  // Правая кнопка мыши — открыть меню выбора статуса
  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 260;
    const spaceBelow = window.innerHeight - e.clientY;
    const spaceAbove = e.clientY;
    const openUpward = (spaceBelow < menuHeight && spaceAbove > 100) || spaceAbove > spaceBelow;
    setMenuPosition({
      top: openUpward ? Math.max(8, e.clientY - menuHeight + 20) : e.clientY + 4,
      right: window.innerWidth - e.clientX,
      openUpward
    });
    setShowStatusMenu(true);
  };

  return (
    <div
      draggable={canEdit}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      className="absolute top-1 left-1 right-1 rounded text-xs cursor-move z-50 transition-none overflow-visible"
      style={{
        height: `${height - 8}px`,
        backgroundColor: hexToRgba(doctorColor, 0.15),
        color: '#111827',
        padding: '6px 10px 6px 14px'
      }}
      onClick={handleClick}
    >
      {/* Цветная полоска слева */}
      <div
        className="absolute top-0 left-0 bottom-0"
        style={{
          width: '4px',
          backgroundColor: doctorColor
        }}
      />

      {/* Иконка статуса */}
      <div className="absolute top-1 right-1 z-50">
        <div
          ref={statusIconRef}
          className={`w-2.5 h-2.5 rounded-full cursor-default ${getStatusDot(appointment.status)}`}
          title={getStatusLabel(appointment.status)}
        />

        {/* Контекстное меню статусов (через портал в body) */}
        {showStatusMenu && createPortal(
          <div style={{ position: 'fixed', zIndex: 99999, top: menuPosition.top, right: menuPosition.right }}>
            {/* Стрелка-индикатор */}
            <div
              className="absolute w-3 h-3 bg-white border-l border-t border-gray-200"
              style={{
                [menuPosition.openUpward ? 'bottom' : 'top']: '-6px',
                right: '8px',
                transform: menuPosition.openUpward ? 'rotate(225deg)' : 'rotate(45deg)'
              }}
            />
            <div
              className="bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[160px]"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
              Статус записи
            </div>
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🖱️ MouseDown на статус:', s.value);
                  handleStatusSelect(e, s.value);
                }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-50 ${
                  appointment.status === s.value ? 'font-semibold text-gray-900' : 'text-gray-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${s.color}`} />
                {s.label}
                {appointment.status === s.value && (
                  <span className="ml-auto text-blue-600"></span>
                )}
              </button>
            ))}
            </div>
          </div>,
          document.body
        )}
      </div>

      {/* Имя пациента */}
      <div className="font-semibold pr-4">
        {patientName === 'Загрузка...' ? (
          <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
        ) : patientName}
      </div>

      {/* Имя врача */}
      <div className="text-xs opacity-75">
        {doctorName === 'Загрузка...' ? (
          <div className="h-3 bg-gray-200 rounded animate-pulse w-20 mt-1"></div>
        ) : doctorName}
      </div>

      {/* Причина приема */}
      {appointment.reason && (
        <div className="text-xs opacity-75 mt-1">
          {appointment.reason}
        </div>
      )}

      {/* Время записи */}
      <div className="text-xs opacity-60 mt-1">
        {appointment.appointment_time}
        {appointment.end_time && ` - ${appointment.end_time}`}
      </div>
    </div>
  );
};

export default AppointmentCard;