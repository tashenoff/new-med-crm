import React from 'react';
import CalendarDatePicker from './CalendarDatePicker';
import CuraiButton from '../../common/CuraiButton';
import CuraiIcon from '../../common/CuraiIcon';
import { SLOT_INTERVAL_MINUTES } from '../../../config/calendarConfig';

export default function CalendarHeader({ currentDate, onDateChange, onNewAppointment, onToggleFullscreen, fullscreen = false }) {
  return <div className={`curai-calendar-header ${fullscreen ? 'curai-calendar-fullscreen-header' : 'calendar-schedule-header calendar-date-nav'}`}>
    <div><h2 className="calendar-date-title">Расписание врачей</h2><p className="calendar-date-subtitle">{currentDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · интервал {SLOT_INTERVAL_MINUTES} минут</p></div>
    <div className={fullscreen ? 'curai-calendar-actions' : 'calendar-header-controls'}>
      <CalendarDatePicker currentDate={currentDate} onDateChange={onDateChange} />
      {onNewAppointment && <CuraiButton variant="primary" className="calendar-new-appointment-btn" onClick={onNewAppointment} data-guide="add-appointment-btn"><CuraiIcon name="plus" /><span>Новая запись</span></CuraiButton>}
      {onToggleFullscreen && <CuraiButton iconOnly onClick={onToggleFullscreen} title={fullscreen ? 'Закрыть' : 'Полноэкранный режим'} aria-label={fullscreen ? 'Закрыть полноэкранный режим' : 'Полноэкранный режим'}><CuraiIcon name={fullscreen ? 'closeFullscreen' : 'fullscreen'} /></CuraiButton>}
    </div>
  </div>;
}
