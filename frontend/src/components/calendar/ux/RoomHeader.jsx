import React from 'react';

export default function RoomHeader({ room, doctors }) {
  return <div className="calendar-room-header">
    <div className="calendar-room-name-row" title={room.name}>{room.name}</div>
    <div className="calendar-room-doctor-row">
      {doctors.length ? doctors.map((doctor, index) => <div key={`${doctor.name}-${index}`} className="curai-room-shift" title={doctor.label} style={{ '--doctor-color': doctor.color || 'var(--curai-color-blue)' }}>
        <span className="curai-doctor-marker" aria-hidden="true" />
        <span className="min-w-0"><span className="curai-room-doctor-name">{doctor.name}</span><span className="curai-room-doctor-time">{doctor.startTime}–{doctor.endTime}</span></span>
      </div>) : <span className="curai-room-no-doctor">— Врачи не назначены</span>}
    </div>
  </div>;
}
