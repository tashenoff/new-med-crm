import { APPOINTMENT_STATUSES, appointmentStatusReason } from '../../../utils/appointmentStatus';
import { AppointmentStatusOptions } from './AppointmentStatusControl';
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
  top = 0,
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

  const formatTime = (time) => String(time || '').replace(/^(\d{1,2}:\d{2})(?::\d{2})?$/, '$1');
  const timeRange = appointment.end_time
    ? `${formatTime(appointment.appointment_time)} – ${formatTime(appointment.end_time)}`
    : formatTime(appointment.appointment_time);
  const cardHeight = height;
  // Reserve space for both detail rows before allowing extra text.
  const allowTwoPatientLines = cardHeight >= 72;
  const showReason = Boolean(appointment.reason) && cardHeight >= 76;
  const cardLabel = [patientName, doctorName, timeRange, appointment.reason].filter(Boolean).join('; ');

  // Возможные статусы
  const STATUSES = APPOINTMENT_STATUSES;

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
    if (!canEdit || appointmentStatusReason(appointment, newStatus)) return;
    const id = appointment._id || appointment.id;
    console.log('📌 Статус выбран:', { id, newStatus, hasCallback: !!onStatusChange });
    if (onStatusChange && id) {
      onStatusChange(id, newStatus);
    }
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
      tabIndex={0}
      role={onEdit ? 'button' : undefined}
      title={cardLabel}
      aria-label={cardLabel}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && onEdit && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          if (!e.repeat) handleClick(e);
        }
      }}
      className="curai-appointment-card absolute left-1 right-1 min-w-0 rounded text-xs cursor-move z-50 transition-none overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
      style={{
        top: `${top}px`,
        height: `${cardHeight}px`,
        backgroundColor: 'var(--curai-color-surface)',
        color: 'var(--curai-color-ink)',
        padding: '4px 8px',
        '--doctor-color': doctorColor
      }}
      onClick={handleClick}
    >
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
            <AppointmentStatusOptions appointment={appointment} onSelect={handleStatusSelect} disabled={!canEdit}/>            </div>
          </div>,
          document.body
        )}
      </div>

      <div className="flex h-full min-w-0 flex-col overflow-hidden">
        <div
          className={`min-w-0 shrink-0 overflow-hidden pr-3 font-semibold leading-4 ${
            allowTwoPatientLines ? 'line-clamp-2 break-words' : 'truncate'
          }`}
        >
          {patientName}
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1 text-[11px] leading-[14px]">
          <span className="curai-appointment-doctor min-w-0 flex-1 truncate opacity-75"><span className="curai-doctor-marker" aria-hidden="true" />{doctorName}</span>

        </div>

        <div className="curai-appointment-meta flex min-w-0 shrink-0 items-center gap-1 text-[11px] leading-[14px]">
          <span className="shrink-0 whitespace-nowrap tabular-nums">{timeRange}</span>
          <span className="min-w-0 flex-1 truncate text-right" title={getStatusLabel(appointment.status)}>{getStatusLabel(appointment.status)}</span>
        </div>

        {showReason && (
          <div className="min-w-0 shrink-0 truncate text-[11px] leading-[14px] opacity-75">
            {appointment.reason}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppointmentCard;
