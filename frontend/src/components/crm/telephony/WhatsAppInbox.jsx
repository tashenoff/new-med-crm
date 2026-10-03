import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { apiClient, handleApiError, API_BASE_URL } from '../../../api/config';
import { useModal } from '../../../context/ModalContext';

// Этапы воронки лидов (реюз семантики «сделок» в CRM) — цветовая схема как в FunnelView.
const FUNNEL_STAGES = [
  { status: 'new',          label: 'Новые заявки',       badge: 'bg-blue-500' },
  { status: 'in_progress',  label: 'В работе',           badge: 'bg-indigo-500' },
  { status: 'contacted',    label: 'Контакт установлен', badge: 'bg-violet-500' },
  { status: 'qualified',    label: 'Квалифицированы',    badge: 'bg-purple-500' },
  { status: 'converted',    label: 'Конвертированы',     badge: 'bg-green-500' },
  { status: 'rejected',     label: 'Отказ',              badge: 'bg-orange-400' },
  { status: 'lost',         label: 'Потеряны',           badge: 'bg-red-400' },
];

const stageLabel = (s) => FUNNEL_STAGES.find(x => x.status === s)?.label || 'Без статуса';
const stageBadge = (s) => FUNNEL_STAGES.find(x => x.status === s)?.badge || 'bg-gray-400';

const contactNameMeta = (c) => c.patient_name || c.contact_name || c.phone || 'Клиент';
const absMedia = (u) => u && u.startsWith('/') ? `${import.meta.env.VITE_BACKEND_URL}${u}` : u;

const formatTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

const WhatsAppInbox = ({ isOpen, onClose }) => {
  const { openModal, closeModal } = useModal();

  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [selected, setSelected] = useState(null); // объект чата
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | chat | lead | patient
  const [error, setError] = useState(null);
  const [statusDirty, setStatusDirty] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [patientDocs, setPatientDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [sysNotes, setSysNotes] = useState([]);

  const listTimer = useRef(null);
  const msgTimer = useRef(null);
  const messagesRef = useRef(null);
  const fileInputRef = useRef(null);
  const attachMenuRef = useRef(null);

  const fetchChats = useCallback(async () => {
    try {
      setLoadingChats(true);
      const { data } = await apiClient.get('/wazzup/chats', { params: { search: search || undefined, limit: 200 } });
      setChats(data.chats || []);
      setError(null);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoadingChats(false);
    }
  }, [search]);

  // Поллинг списка чатов (решение: без WebSocket).
  useEffect(() => {
    if (!isOpen) return;
    fetchChats();
    listTimer.current = setInterval(fetchChats, 5000);
    return () => clearInterval(listTimer.current);
  }, [isOpen, fetchChats]);

  const fetchMessages = useCallback(async (phone) => {
    try {
      setLoadingMessages(true);
      const { data } = await apiClient.get(`/wazzup/messages/history/${phone}`, { params: { limit: 100 } });
      const msgs = (data.messages || []).slice();
      // API отдаёт историю новые-сверху; в UI нужен хронологический порядок (старые сверху).
      setMessages(msgs.reverse());
      setError(null);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const selectChat = async (chat) => {
    setSelected(chat);
    setSysNotes([]);
    await fetchMessages(chat.phone);
  };

  // Поллинг открытого чата.
  useEffect(() => {
    if (!isOpen || !selected) return;
    fetchMessages(selected.phone);
    msgTimer.current = setInterval(() => fetchMessages(selected.phone), 5000);
    return () => clearInterval(msgTimer.current);
  }, [isOpen, selected, fetchMessages]);

  // При закрытии сбрасываем выбор.
  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setMessages([]);
      setSearch('');
      setSysNotes([]);
    }
  }, [isOpen]);

  // Автоскролл переписки вниз при новых сообщениях/смене чата.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selected]);

  const sendMessage = async () => {
    const text = newMessage.trim();
    if (!text || !selected || sending) return;
    setSending(true);
    try {
      await apiClient.post('/wazzup/messages/send', { phone: selected.phone, text });
      setNewMessage('');
      await Promise.all([fetchMessages(selected.phone), fetchChats()]);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSending(false);
    }
  };

  // Отправка файла пациенту: загрузка в /uploads -> send-media -> обновить переписку.
  const sendFile = async (file) => {
    if (!file || !selected || uploadingFile) return;
    setUploadingFile(true);
    try {
      // Загрузка через fetch: браузер сам ставит multipart/form-data с boundary.
      // axios/apiClient со своим Content-Type: application/json ломал загрузку (422).
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE_URL}/wazzup/media/upload`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: fd,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || 'Ошибка загрузки файла');
      }
      const data = await resp.json();
      const mediaUrl = `${import.meta.env.VITE_BACKEND_URL}${data.relative_url}`;
      await apiClient.post('/wazzup/messages/send-media', {
        phone: selected.phone,
        media_url: mediaUrl,
        media_type: data.media_type,
        original_filename: file.name,
      });
      await Promise.all([fetchMessages(selected.phone), fetchChats()]);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Сохранить входящее медиа в Документы пациента (по клику «💾»).
  const saveMediaToPatient = async (m) => {
    if (!m?.id || uploadingFile) return;
    setUploadingFile(true);
    try {
      await apiClient.post(`/wazzup/messages/${m.id}/save-to-patient`);
      // Помечаем сообщение сохранённым локально.
      setMessages(prev =>
        prev.map(x => (x.id === m.id ? { ...x, metadata: { ...x.metadata, saved_to_patient: true } } : x))
      );
      // Служебное уведомление — в отдельном списке, чтобы поллинг его не стирал.
      setSysNotes(prev => [...prev, { id: `sys-saved-${m.id}-${Date.now()}`, text: '💾 Документ сохранён в карточке пациента' }]);
      setError(null);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleAttachClick = () => fileInputRef.current && fileInputRef.current.click();

  // Загрузить список документов пациента из его карточки (для отправки без повторной загрузки).
  const loadPatientDocs = async () => {
    if (!selected?.patient_id) return;
    setLoadingDocs(true);
    try {
      const { data } = await apiClient.get(`/patients/${selected.patient_id}/documents`);
      setPatientDocs(data || []);
      setAttachMenuOpen(true);
      setError(null);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoadingDocs(false);
    }
  };

  // Отправить уже загруженный документ из карточки клиента (media_url уже есть, повторно не грузим).
  const sendExistingDoc = async (doc) => {
    if (!selected || uploadingFile) return;
    setUploadingFile(true);
    setAttachMenuOpen(false);
    try {
      const mediaUrl = `${import.meta.env.VITE_BACKEND_URL}/uploads/${doc.filename}`;
      await apiClient.post('/wazzup/messages/send-media', {
        phone: selected.phone,
        media_url: mediaUrl,
        media_type: doc.file_type || 'document',
        original_filename: doc.original_filename || doc.filename,
      });
      await Promise.all([fetchMessages(selected.phone), fetchChats()]);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setUploadingFile(false);
    }
  };

  // Закрыть попап при клике вне его.
  useEffect(() => {
    if (!attachMenuOpen) return;
    const onClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [attachMenuOpen]);

  const toggleAttachMenu = () => {
    if (selected?.patient_id) {
      setAttachMenuOpen((v) => !v);
      if (!attachMenuOpen) loadPatientDocs();
    } else {
      handleAttachClick();
    }
  };


  const changeStatus = async (status) => {
    if (!selected) return;
    try {
      await apiClient.patch(`/wazzup/chats/${encodeURIComponent(selected.phone)}`, { status });
      setSelected({ ...selected, status });
      setStatusDirty(false);
      await fetchChats();
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  // Сохранение записи из модала: создать через /appointments, закрыть, обновить список чатов.
  const bookAppointment = async (form) => {
    try {
      await apiClient.post('/appointments', form);
      closeModal('appointment');
      setStatusDirty(true);
      await fetchChats();
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  // «Записать» — открыть штатный модал записи. Если чат связан с существующим
  // пациентом в CRM — модал сразу показывает его (patient_id + patients[]).
  // Если это лид без пациента — переиспользуем механизм CRM «Сделки»:
  // /api/crm/leads/{id}/schedule-appointment создаст пациента, запись и пометит лид.
  const handleBook = async () => {
    if (!selected) return;
    const isLead = selected.linked_lead_id && !selected.patient_id;

    // Лид без пациента: переиспользуем конвертацию из раздела «Сделки».
    if (isLead) {
      const lead = selected;
      // Подгружаем врачей, иначе модал не предложит врача при выборе кабинета.
      let doctorsList = [];
      try {
        const { data } = await apiClient.get('/doctors');
        doctorsList = Array.isArray(data) ? data : (data?.doctors || []);
      } catch (e) {
        console.warn('Не удалось загрузить врачей:', e);
      }
      openModal('appointment', {
        appointmentForm: {
          patient_id: '',
          doctor_id: '',
          appointment_date: new Date().toISOString().split('T')[0],
          appointment_time: '10:00',
          end_time: '10:30',
          room_id: '',
          status: 'confirmed',
          reason: 'Консультация',
          notes: `Запись из WhatsApp. Лид: ${selected.patient_name || selected.contact_name || ''}${selected.phone ? `, тел: ${selected.phone}` : ''}`,
          patient_notes: '',
          price: 0,
          deposit_type: '',
          deposit: 0,
          source: lead.source || 'phone',
          source_id: lead.source_id || '',
          lead_first_name: (selected.patient_name || selected.contact_name || '').split(' ')[0] || '',
          lead_last_name: (selected.patient_name || selected.contact_name || '').split(' ')[1] || '',
          lead_middle_name: '',
          lead_phone: selected.phone,
          lead_email: selected.email || '',
          lead_source: lead.source || 'phone',
          lead_source_id: lead.source_id || '',
          showNewPatientForm: true,
        },
        doctors: doctorsList,
        patients: [],
        editingItem: null,
        loading: false,
        errorMessage: null,
        hideCreatePatientButton: true,
        onSave: async (appointmentData) => {
          try {
            const res = await apiClient.post(`/crm/leads/${selected.linked_lead_id}/schedule-appointment`, {
              doctor_id: appointmentData.doctor_id,
              appointment_date: appointmentData.appointment_date,
              appointment_time: appointmentData.appointment_time,
              end_time: appointmentData.end_time,
              room_id: appointmentData.room_id,
              service: appointmentData.reason || 'Консультация',
              notes: `Запись из WhatsApp. Заявка: ${selected.patient_name || selected.contact_name || ''}`,
              price: appointmentData.price || 0,
              deposit: appointmentData.deposit || null,
              deposit_type: appointmentData.deposit_type || null,
            });
            closeModal('appointment');
            setStatusDirty(true);
            await fetchChats();
            return res.data;
          } catch (err) {
            setError(handleApiError(err));
            throw err;
          }
        },
      });
      return;
    }

    const patients = selected.patient_id
      ? [{ id: selected.patient_id, full_name: selected.patient_name, phone: selected.patient_phone || selected.phone }]
      : [];
    openModal('appointment', {
      patients,
      appointmentForm: {
        patient_id: selected.patient_id || '',
        patient_name: selected.patient_name || selected.contact_name || '',
        patient_phone: selected.patient_phone || selected.phone,
        appointment_date: new Date().toISOString().split('T')[0],
      },
      // Скрываем форму создания плана в этом контексте, оставляем саму запись.
      hideAddPlanForm: true,
      onSave: bookAppointment,
    });
  };

  const openPatientCard = () => {
    if (!selected?.patient_id) return;
    openModal('patient', {
      editingItem: {
        id: selected.patient_id,
        full_name: selected.patient_name || selected.contact_name || '',
        phone: selected.patient_phone || selected.phone,
      },
      patientForm: {
        id: selected.patient_id,
        full_name: selected.patient_name || selected.contact_name || '',
        phone: selected.patient_phone || selected.phone,
      },
    });
  };

  const chatIsLead = (c) => c.source === 'lead' || (c.linked_lead_id && !c.patient_id && !c.linked_patient_id);
  const chatIsPatient = (c) => !!c.patient_id || !!c.linked_patient_id;
  const chatIsPlain = (c) => !chatIsLead(c) && !chatIsPatient(c);

  const filteredChats = chats.filter(c => {
    if (typeFilter === 'lead' && !chatIsLead(c)) return false;
    if (typeFilter === 'patient' && !chatIsPatient(c)) return false;
    if (typeFilter === 'chat' && !chatIsPlain(c)) return false;
    return !search ||
      (c.contact_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search);
  });

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed bottom-0 right-0 top-0 z-[60] flex flex-col bg-white shadow-2xl border-l border-gray-200"
      style={{ width: 'min(880px, 96vw)' }}
    >
      {/* Шапка */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white">
        <div className="flex items-center gap-2">
          <span className="text-xl">💬</span>
          <h3 className="font-semibold">WhatsApp чаты</h3>
          {loadingChats && <span className="text-xs text-green-100">обновление…</span>}
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg" title="Закрыть">
          ✖️
        </button>
      </div>

      {/* Поиск и фильтр */}
      <div className="flex-shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или телефону…"
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <div className="flex items-center gap-1 mt-2">
          {[
            { key: 'all', label: 'Все' },
            { key: 'chat', label: 'Чаты' },
            { key: 'lead', label: 'Лиды' },
            { key: 'patient', label: 'Пациенты' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                typeFilter === f.key
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex-shrink-0 mx-3 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* Список чатов */}
        <div className="w-72 flex-shrink-0 border-r border-gray-200 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            {filteredChats.length === 0 && !loadingChats && (
              <div className="p-6 text-center text-gray-400 text-sm">
                Чатов нет
              </div>
            )}
            {filteredChats.map((c) => (
              <button
                key={c.phone}
                onClick={() => selectChat(c)}
                className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  selected?.phone === c.phone ? 'bg-green-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-900 truncate">
                    {contactNameMeta(c)}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatTime(c.last_message_time)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-gray-500 truncate">{c.source === 'lead' && !c.last_message ? 'Начать переписку — нажмите' : (c.last_message || '')}</span>
                  {c.unread_count > 0 && (
                    <span className="ml-2 flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-green-500 text-white text-[11px] flex items-center justify-center">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`w-2 h-2 rounded-full ${stageBadge(c.status)}`} />
                  <span className="text-[11px] text-gray-500">{stageLabel(c.status)}</span>
                  {c.linked_lead_id && <span className="text-[10px] text-blue-500 ml-auto">{c.source === 'lead' ? 'лид (CRM)' : 'лид'}</span>}
                  {c.linked_patient_id && <span className="text-[10px] text-indigo-500 ml-1">пациент</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Переписка */}
        <div className="flex-1 min-h-0 flex flex-col">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <span className="text-5xl mb-3">💬</span>
              <p className="text-sm font-medium">Выберите чат слева</p>
            </div>
          ) : (
            <>
              {/* Шапка чата: статус + запись */}
              <div className="flex-shrink-0 px-4 py-2.5 bg-gray-50 border-b border-gray-200 space-y-2">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{contactNameMeta(selected)}</div>
                  <div className="text-xs text-gray-500">{selected.phone}</div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {selected.patient_id && (
                    <button
                      onClick={openPatientCard}
                      className="h-9 px-3 whitespace-nowrap border border-gray-300 hover:bg-white bg-white text-gray-700 text-sm rounded-lg font-medium"
                      title="Открыть карточку пациента"
                    >
                      👤 Карточка пациента
                    </button>
                  )}

                  <select
                    value={selected.status || ''}
                    onChange={(e) => changeStatus(e.target.value)}
                    className="h-9 px-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="">Без статуса</option>
                    {FUNNEL_STAGES.map(s => (
                      <option key={s.status} value={s.status}>{s.label}</option>
                    ))}
                  </select>

                  <button
                    onClick={handleBook}
                    className="h-9 px-3 whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium"
                    title="Назначить запись"
                  >
                    📅 Записать
                  </button>
                </div>
              </div>

              {/* Сообщения */}
              <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 bg-gray-50">
                {loadingMessages && messages.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-10">Загрузка…</div>
                )}
                {messages.length === 0 && !loadingMessages && (
                  <div className="text-center text-gray-400 text-sm py-10">Сообщений пока нет</div>
                )}
                {messages.map((m, i) => {
                  // Служебное сообщение (системная запись в переписку менеджера).
                  if (m.system) {
                    return (
                      <div key={i} className="flex justify-center">
                        <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full my-0.5">
                          {m.text}
                        </span>
                      </div>
                    );
                  }
                  const outgoing = m.metadata?.from_me || m.direction === 'outgoing';
                  const fname = m.metadata?.filename || (m.media_url ? m.media_url.split('?')[0].split('/').pop() : '') || 'Файл';
                  return (
                    <div key={i} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm break-words ${
                        outgoing ? 'bg-green-500 text-white rounded-br-none' : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none'
                      }`}>
                        {m.text && <div className="text-sm whitespace-pre-wrap">{m.text}</div>}
                        {m.media_url && m.message_type === 'image' && (
                          <a href={absMedia(m.media_url)} target="_blank" rel="noopener noreferrer" className="block mt-1">
                            <img src={absMedia(m.media_url)} alt={fname} className="max-w-full max-h-56 rounded-lg border border-gray-200" />
                            <div className={`text-xs mt-1 truncate max-w-[220px] ${outgoing ? 'text-green-100' : 'text-gray-500'}`} title={fname}>
                              📎 {fname}
                            </div>
                          </a>
                        )}
                        {m.media_url && m.message_type === 'audio' && (
                          <div className="mt-1">
                            <audio controls src={absMedia(m.media_url)} className="max-w-full h-9" preload="none" />
                          </div>
                        )}
                        {m.media_url && m.message_type !== 'image' && m.message_type !== 'audio' && (
                          <a href={absMedia(m.media_url)} target="_blank" rel="noopener noreferrer"
                             className={`text-xs underline mt-1 inline-block ${outgoing ? 'text-green-100' : 'text-blue-600'}`}>
                            📎 {fname}
                          </a>
                        )}

                        {/* Сохранение входящего медиа в карточку пациента (по клику). */}
                        {m.media_url && !outgoing && m.message_type !== 'audio' && !m.metadata?.saved_to_patient && (
                          <button
                            onClick={() => saveMediaToPatient(m)}
                            disabled={uploadingFile}
                            title="Сохранить документ в карточке пациента"
                            className={`mt-1 text-xs flex items-center gap-1 rounded px-1.5 py-0.5 border border-gray-300 hover:bg-gray-50 ${
                              outgoing ? 'text-green-100' : 'text-gray-600'
                            }`}
                          >
                            <span>💾</span> Сохранить в карточке
                          </button>
                        )}
                        {m.media_url && !outgoing && m.message_type !== 'audio' && m.metadata?.saved_to_patient && (
                          <div className="mt-1 text-[11px] text-green-600 flex items-center gap-1">
                            <span>✓</span> Сохранено в карточке
                          </div>
                        )}

                        <div className={`text-xs mt-1 flex justify-end ${outgoing ? 'text-green-100' : 'text-gray-400'}`}>
                          {formatTime(m.sent_at)}
                          {outgoing && <span className="ml-1">{m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓'}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sysNotes.map((n) => (
                  <div key={n.id} className="flex justify-center">
                    <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full my-0.5">
                      {n.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* Ввод */}
              <div className="flex-shrink-0 p-3 bg-white border-t border-gray-200 flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) sendFile(f); }}
                />
                <div className="relative flex-shrink-0">
                  <button
                    onClick={toggleAttachMenu}
                    disabled={uploadingFile || !selected}
                    title={uploadingFile ? 'Загрузка файла…' : 'Вложить файл'}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 disabled:opacity-50 text-lg"
                  >
                    {uploadingFile ? '…' : '📎'}
                  </button>

                  {attachMenuOpen && (
                    <div
                      ref={attachMenuRef}
                      className="absolute bottom-12 left-0 w-72 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden"
                    >
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                        Вложить файл
                      </div>

                      <div className="px-3 py-2 text-xs font-medium text-gray-600 flex items-center gap-2">
                        <span>📁</span> Из документов клиента
                      </div>

                      {loadingDocs && patientDocs.length === 0 && (
                        <div className="px-4 py-2 text-xs text-gray-400">Загрузка документов…</div>
                      )}

                      {!loadingDocs && patientDocs.length > 0 && (
                        <div className="max-h-48 overflow-y-auto border-t border-gray-100">
                          {patientDocs.map((doc) => (
                            <button
                              key={doc.id || doc.filename}
                              onClick={() => sendExistingDoc(doc)}
                              disabled={uploadingFile}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50"
                              title={doc.original_filename || doc.filename}
                            >
                              <span className="flex-shrink-0">📄</span>
                              <span className="flex-1 truncate">{doc.original_filename || doc.filename}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {!loadingDocs && patientDocs.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
                          Нет документов в карточке клиента
                        </div>
                      )}

                      <button
                        onClick={() => { setAttachMenuOpen(false); handleAttachClick(); }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                      >
                        <span>💻</span>
                        <span>
                          С компьютера
                          <span className="block text-xs text-gray-400 font-normal">выбрать и загрузить новый файл</span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Введите сообщение…"
                  rows="1"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {sending ? '…' : 'Отправить'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WhatsAppInbox;
