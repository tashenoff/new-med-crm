import React, { useRef, useState } from 'react';
import CuraiIcon from '../../common/CuraiIcon';

const clock = value => Number.isFinite(value) && value >= 0 ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';
export default function WhatsAppAudio({ src }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false), [elapsed, setElapsed] = useState(0), [duration, setDuration] = useState(0), [error, setError] = useState('');
  const toggle = async () => {
    try { setError(''); if (audio.current.paused) await audio.current.play(); else audio.current.pause(); }
    catch { setPlaying(false); setError('Не удалось воспроизвести аудио'); }
  };
  return <div className="curai-whatsapp-audio">
    <audio ref={audio} src={src} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => setElapsed(audio.current.currentTime)} onLoadedMetadata={() => setDuration(Number.isFinite(audio.current.duration) ? audio.current.duration : 0)} onDurationChange={() => setDuration(Number.isFinite(audio.current.duration) ? audio.current.duration : 0)} onError={() => { setPlaying(false); setError('Аудио недоступно'); }}/>
    <button type="button" className="curai-button curai-button-icon curai-audio-toggle" data-playing={playing} onClick={toggle} aria-label={playing ? 'Приостановить аудио' : 'Воспроизвести аудио'}><CuraiIcon name={playing ? 'pause' : 'play'}/></button>
    <div className="curai-audio-track"><strong>Аудиосообщение</strong><input type="range" aria-label="Позиция воспроизведения" min="0" max={duration || 0} step="0.1" value={Math.min(elapsed, duration || 0)} style={{'--audio-progress': `${duration ? elapsed / duration * 100 : 0}%`}} disabled={!duration} onChange={event => { audio.current.currentTime = Number(event.target.value); setElapsed(Number(event.target.value)); }}/><span>{clock(elapsed)}</span></div>
    <span className="curai-audio-duration">{duration ? clock(duration) : '—:—'}</span>
    {error && <span className="curai-audio-error" role="alert">{error}</span>}
  </div>;
}
