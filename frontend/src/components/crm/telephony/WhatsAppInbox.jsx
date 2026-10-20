import WhatsAppConnectionBadge from './WhatsAppConnectionBadge';
import PatientAppointments from './PatientAppointments';
import WhatsAppAudio from './WhatsAppAudio';
import CuraiIcon from '../../common/CuraiIcon';
import CuraiButton from '../../common/CuraiButton';
import ChatCrmStage from './ChatCrmStage';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { apiClient, handleApiError, API_BASE_URL } from '../../../api/config';
import { useModal } from '../../../context/ModalContext';
import { useGlobalRefresh } from '../../../hooks/useGlobalRefresh';

const contactNameMeta = (c) => c.patient_name || c.lead_name || c.contact_name || c.phone || 'Клиент';
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

const formatMessageTime = value => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString('ru-RU', { timeZone: 'Asia/Bishkek', hour: '2-digit', minute: '2-digit' }) : '';
};

const WhatsAppInbox = ({ isOpen, onClose }) => {
  const { openModal, closeModal } = useModal();
  const { refreshAppointments } = useGlobalRefresh();

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
  const [appointmentsRevision, setAppointmentsRevision] = useState(0);
  const messageGeneration = useRef(0);
  const chatOpenRef = useRef(isOpen); chatOpenRef.current = isOpen;
  const bookingPendingRef = useRef(false);
  const bookingChatRef = useRef(null);
  bookingChatRef.current = isOpen ? selected : null;
  const [openingBooking, setOpeningBooking] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [patientDocs, setPatientDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [sysNotes, setSysNotes] = useState([]);

  const listTimer = useRef(null);
  const msgTimer = useRef(null);
  const messagesRef = useRef(null);
  const fileInputRef = useRef(null);
  const savingMediaRef = useRef(new Set());
  const attachMenuRef = useRef(null);
  const selectedPhoneRef = useRef(null);
  selectedPhoneRef.current = selected?.phone;

  const fetchChats = useCallback(async () => {
    try {
      setLoadingChats(true);
      const { data } = await apiClient.get('/wazzup/chats', { params: { search: search || undefined, limit: 200 } });
      setChats(data.chats || []);
      const selectedPhone = selectedPhoneRef.current;
      let refreshedSelected = (data.chats || []).find(chat => chat.phone === selectedPhone);
      // Renaming can remove the open chat from the current search results.
      if (selectedPhone && !refreshedSelected) {
        const { data: selectedData } = await apiClient.get('/wazzup/chats', { params: { search: selectedPhone, limit: 200 } });
        refreshedSelected = (selectedData.chats || []).find(chat => chat.phone === selectedPhone);
      }
      setSelected(current => current
        ? (refreshedSelected?.phone === current.phone ? refreshedSelected : current)
        : null);
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
    const request = ++messageGeneration.current;
    const current = () => request === messageGeneration.current && selectedPhoneRef.current === phone && chatOpenRef.current;
    try {
      setLoadingMessages(true);
      const { data } = await apiClient.get(`/wazzup/messages/history/${phone}`, { params: { limit: 100 } });
      const msgs = (data.messages || []).slice();
      // API отдаёт историю новые-сверху; в UI нужен хронологический порядок (старые сверху).
      if (!current()) return;
      setMessages(msgs.reverse());
      setError(null);
    } catch (err) {
      if (current()) setError(handleApiError(err));
    } finally {
      if (current()) setLoadingMessages(false);
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
  }, [isOpen, selected?.phone, fetchMessages]);

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

  // Сохранить вложение в Документы пациента по явному клику в любом направлении.
  const saveMediaToPatient = async (m) => {
    if (!m?.id || uploadingFile || m.metadata?.saved_to_patient || savingMediaRef.current.has(m.id)) return;
    savingMediaRef.current.add(m.id);
    const activePhone = selectedPhoneRef.current;
    setUploadingFile(true);
    try {
      await apiClient.post(`/wazzup/messages/${m.id}/save-to-patient`);
      if (selectedPhoneRef.current !== activePhone) return;
      // Помечаем сообщение сохранённым локально.
      setMessages(prev =>
        prev.map(x => (x.id === m.id ? { ...x, metadata: { ...x.metadata, saved_to_patient: true } } : x))
      );
      // Служебное уведомление — в отдельном списке, чтобы поллинг его не стирал.
      setSysNotes(prev => [...prev, { id: `sys-saved-${m.id}-${Date.now()}`, text: '💾 Документ сохранён в карточке пациента' }]);
      setError(null);
    } catch (err) {
      if (selectedPhoneRef.current === activePhone) setError(handleApiError(err));
    } finally {
      savingMediaRef.current.delete(m.id);
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




  // Сохранение записи из модала: создать через /appointments, закрыть, обновить список чатов.
  const bookAppointment = async (form) => {
    try {
      const result = await apiClient.post('/appointments', form);
      refreshAppointments();
      closeModal('appointment');
      setStatusDirty(true);
      setAppointmentsRevision(value => value + 1);
      await fetchChats();
      return result.data;
    } catch (err) {
      setError(handleApiError(err));
      throw err;
    }
  };

  // «Записать» — открыть штатный модал записи. Если чат связан с существующим
  // пациентом в CRM — модал сразу показывает его (patient_id + patients[]).
  // Если это лид без пациента — переиспользуем механизм CRM «Сделки»:
  // /api/crm/leads/{id}/schedule-appointment создаст пациента, запись и пометит лид.
  const handleBook = async () => {
    if (!selected || bookingPendingRef.current) return;
    const bookingChat = selected;
    bookingPendingRef.current = true;
    setOpeningBooking(true);
    setError(null);
    try {
    const [{ data: doctorData }, { data: appointmentData }] = await Promise.all([apiClient.get('/doctors'), apiClient.get('/appointments')]);
    if (bookingChatRef.current !== bookingChat) return;
    const doctorsList = (Array.isArray(doctorData) ? doctorData : doctorData?.doctors || []).filter(doctor => doctor.is_active !== false).map(doctor => ({ ...doctor, id: doctor.id || doctor._id }));
    const appointmentsList = Array.isArray(appointmentData) ? appointmentData : appointmentData?.appointments || [];
    const patientId = selected.patient_id || selected.linked_patient_id || '';
    const isLead = selected.linked_lead_id && !patientId;

    // Лид без пациента: переиспользуем конвертацию из раздела «Сделки».
    if (isLead) {
      const lead = selected;
      // Подгружаем врачей, иначе модал не предложит врача при выборе кабинета.
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
          notes: `Запись из WhatsApp. Лид: ${contactNameMeta(selected)}${selected.phone ? `, тел: ${selected.phone}` : ''}`,
          patient_notes: '',
          price: 0,
          deposit_type: '',
          deposit: 0,
          source: lead.source || 'phone',
          source_id: lead.source_id || '',
          lead_full_name: contactNameMeta(selected),
          lead_first_name: contactNameMeta(selected),
          lead_last_name: '',
          lead_middle_name: '',
          lead_phone: selected.phone,
          lead_email: selected.email || '',
          lead_source: lead.source || 'phone',
          lead_source_id: lead.source_id || '',
          showNewPatientForm: true,
        },
        doctors: doctorsList,
        appointments: appointmentsList,
        hideAddPlanForm: true,
        patients: [],
        editingItem: null,
        loading: false,
        errorMessage: null,
        hideCreatePatientButton: true,
        onSave: async (appointmentData) => {
          try {
            const res = await apiClient.post(`/crm/leads/${selected.linked_lead_id}/schedule-appointment`, {
              ...(appointmentData.patient_full_name ? { patient_full_name: appointmentData.patient_full_name } : {}),
              doctor_id: appointmentData.doctor_id,
              appointment_date: appointmentData.appointment_date,
              appointment_time: appointmentData.appointment_time,
              end_time: appointmentData.end_time,
              room_id: appointmentData.room_id,
              service: appointmentData.reason || 'Консультация',
              notes: `Запись из WhatsApp. Заявка: ${contactNameMeta(selected)}`,
              price: appointmentData.price || 0,
              deposit: appointmentData.deposit || null,
              deposit_type: appointmentData.deposit_type || null,
            });
            refreshAppointments();
            closeModal('appointment');
            setStatusDirty(true);
      setAppointmentsRevision(value => value + 1);
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

    const patients = patientId
      ? [{ id: patientId, full_name: contactNameMeta(selected), phone: selected.patient_phone || selected.phone }]
      : [];
    openModal('appointment', {
      doctors: doctorsList,
      appointments: appointmentsList,
      editingItem: null,
      errorMessage: null,
      patients,
      appointmentForm: {
        patient_id: patientId,
        doctor_id: '',
        appointment_time: '10:00',
        end_time: '10:30',
        room_id: '',
        reason: 'Консультация',
        price: 0,
        deposit: 0,
        deposit_type: '',
        source: selected.source || 'phone',
        source_id: selected.source_id || '',
        patient_name: contactNameMeta(selected),
        patient_phone: selected.patient_phone || selected.phone,
        appointment_date: new Date().toISOString().split('T')[0],
      },
      // Скрываем форму создания плана в этом контексте, оставляем саму запись.
      hideAddPlanForm: true,
      onSave: bookAppointment,
    });
    } catch (err) {
      if (bookingChatRef.current === bookingChat) setError(handleApiError(err));
    } finally {
      bookingPendingRef.current = false;
      setOpeningBooking(false);
    }
  };

  const openPatientCard = () => {
    const patientId = selected?.patient_id || selected?.linked_patient_id;
    if (!patientId) return;
    openModal('patient', {
      editingItem: {
        id: patientId,
        full_name: contactNameMeta(selected),
        phone: selected.patient_phone || selected.phone,
      },
      patientForm: {
        id: patientId,
        full_name: contactNameMeta(selected),
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
      contactNameMeta(c).toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search);
  });

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`curai-surface-root curai-glass-shell curai-whatsapp${selected ? ' has-selection' : ''}`}
      style={{ width: 'min(880px, 96vw)' }}
    >
      {/* Шапка */}
      <div className="curai-whatsapp-title curai-glass-header">
        <div className="flex items-center gap-2">
          {selected && <CuraiButton variant="ghost" iconOnly className="curai-chat-back" aria-label="К списку чатов" onClick={() => setSelected(null)}><CuraiIcon name="arrow-left"/></CuraiButton>}
          <WhatsAppConnectionBadge isOpen={isOpen}/>
          <h3 className="font-semibold">WhatsApp чаты</h3>

        </div>
        <button onClick={onClose} className="curai-button curai-button-ghost curai-button-icon" title="Закрыть" aria-label="Закрыть WhatsApp">
          <CuraiIcon name="close"/>
        </button>
      </div><div className="curai-glass-body curai-whatsapp-body">

      {error && (
        <div className="flex-shrink-0 mx-3 mt-2 px-3 py-2 bg-curai-negativeBg border border-curai-negative rounded-md text-sm text-curai-negative">
          ⚠️ {error}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* Список чатов */}
        <div className="curai-chat-sidebar">
      {/* Поиск и фильтр */}
      <div className="curai-chat-search">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или телефону…"
          className="w-full px-3 py-1.5 border border-curai-control rounded-md text-sm focus:ring-2 focus:ring-curai-focus focus:border-transparent"
        />
        <div className="flex items-center gap-1 mt-2">
          {[
            { key: 'all', label: 'Все' },
            { key: 'lead', label: 'Лиды' },
            { key: 'patient', label: 'Пациенты' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              aria-pressed={typeFilter === f.key}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                typeFilter === f.key
                  ? "bg-curai-blue text-white"
                  : "bg-curai-surface text-curai-muted border border-curai-control hover:bg-curai-subtle"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>


          <div className="flex-1 overflow-y-auto">
            {filteredChats.length === 0 && !loadingChats && (
              <div className="p-6 text-center text-curai-muted text-sm">
                Чатов нет
              </div>
            )}
            {filteredChats.map((c) => (
              <button
                key={c.phone}
                onClick={() => selectChat(c)}
                className={`w-full text-left px-3 py-3 border-b border-curai-border hover:bg-curai-subtle transition-colors ${
                  selected?.phone === c.phone ? "bg-curai-selected" : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-curai-ink truncate">
                    {contactNameMeta(c)}
                  </span>
                  <span className="text-xs text-curai-muted flex-shrink-0 ml-2">{formatTime(c.last_message_time)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-curai-muted truncate">{c.source === 'lead' && !c.last_message ? 'Начать переписку — нажмите' : (c.last_message || '')}</span>
                  {c.unread_count > 0 && (
                    <span className="ml-2 flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-curai-blue text-white text-[11px] flex items-center justify-center">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <div className="curai-chat-contact-type">{chatIsPatient(c) ? 'Пациент' : chatIsLead(c) ? 'Лид CRM' : 'Контакт'}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Переписка */}
        <div className="curai-chat-thread">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-curai-muted">
              <span className="text-2xl mb-3">💬</span>
              <p className="text-sm font-medium">Выберите чат слева</p>
            </div>
          ) : (
            <>
              <div className="curai-chat-header">
                <div className="curai-chat-person" aria-label="Контакт выбранного чата"><CuraiIcon name="person"/>{selected.patient_id || selected.linked_patient_id ? <button type="button" className="curai-patient-link" onClick={openPatientCard} title={contactNameMeta(selected)}>{contactNameMeta(selected)}</button> : <strong title={contactNameMeta(selected)}>{contactNameMeta(selected)}</strong>}</div>
                <div className="curai-chat-header-actions">
                  <PatientAppointments key={selected.phone} patientId={selected.patient_id || selected.linked_patient_id} patientName={contactNameMeta(selected)} revision={appointmentsRevision} onBook={handleBook} booking={openingBooking} onChanged={fetchChats} showBookAction={false}/>
                  <ChatCrmStage phone={selected.phone} revision={selected} onChanged={fetchChats} variant="menu"/>
                  <CuraiButton variant="primary" onClick={handleBook} disabled={openingBooking} aria-busy={openingBooking} title="Назначить запись">Записать</CuraiButton>
                </div>
                <div className="curai-chat-phone">{selected.phone}</div>
                {(selected.deal_title || selected.lead_title) && <div className="curai-chat-deal-title">Сделка: {selected.deal_title || selected.lead_title}</div>}
              </div>

              {/* Сообщения */}
              <div ref={messagesRef} className="curai-chat-messages">
                {loadingMessages && messages.length === 0 && (
                  <div className="text-center text-curai-muted text-sm py-10">Загрузка…</div>
                )}
                {messages.length === 0 && !loadingMessages && (
                  <div className="text-center text-curai-muted text-sm py-10">Сообщений пока нет</div>
                )}
                {messages.map((m, i) => {
                  // Служебное сообщение (системная запись в переписку менеджера).
                  if (m.system) {
                    return (
                      <div key={i} className="flex justify-center">
                        <span className="text-[11px] text-curai-muted bg-curai-subtle px-2 py-0.5 rounded-full my-0.5">
                          {m.text}
                        </span>
                      </div>
                    );
                  }
                  const outgoing = m.metadata?.from_me || m.direction === 'outgoing';
                  const fname = m.metadata?.filename || (m.media_url ? m.media_url.split('?')[0].split('/').pop() : '') || 'Файл';
                  return (
                    <div key={i} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                      <div className={`curai-chat-bubble${outgoing ? ' is-outgoing' : ''}${m.message_type === 'audio' ? ' has-audio' : ''}`}>

                        {m.text && <div className="text-sm whitespace-pre-wrap">{m.text}</div>}
                        {m.media_url && m.message_type === 'image' && (
                          <a href={absMedia(m.media_url)} target="_blank" rel="noopener noreferrer" className="block mt-1">
                            <img src={absMedia(m.media_url)} alt={fname} className="max-w-full max-h-56 rounded-md border border-curai-border" />
                            <div className={`text-xs mt-1 truncate max-w-[220px] ${outgoing ? "text-curai-blue" : "text-curai-muted"}`} title={fname}>
                              <CuraiIcon name="file" className="curai-inline-icon"/> {fname}
                            </div>
                          </a>
                        )}
                        {m.media_url && m.message_type === 'audio' && (
                          <div className="mt-1">
                            <WhatsAppAudio key={absMedia(m.media_url)} src={absMedia(m.media_url)}/>
                          </div>
                        )}
                        {m.media_url && m.message_type !== 'image' && m.message_type !== 'audio' && (
                          <a href={absMedia(m.media_url)} target="_blank" rel="noopener noreferrer"
                             className="curai-chat-file">
                            <CuraiIcon name="file" className="curai-inline-icon"/> {fname}
                          </a>
                        )}

                        {/* Сохранение вложения в карточку пациента в обоих направлениях. */}
                        {m.media_url && m.message_type !== 'audio' && !m.metadata?.saved_to_patient && (
                          <button
                            onClick={() => saveMediaToPatient(m)}
                            disabled={uploadingFile}
                            title="Сохранить документ в карточке пациента"
                            className={`mt-1 text-xs flex items-center gap-1 rounded px-1.5 py-0.5 border border-curai-control hover:bg-curai-subtle ${
                              outgoing ? "text-curai-blue" : "text-curai-muted"
                            }`}
                          >
                            <CuraiIcon name="save-file" className="curai-save-icon"/> Сохранить в карточке
                          </button>
                        )}
                        {m.media_url && m.message_type !== 'audio' && m.metadata?.saved_to_patient && (
                          <div className="mt-1 text-[11px] text-curai-blue flex items-center gap-1">
                            <span>✓</span> Сохранено в карточке
                          </div>
                        )}

                        <div className="curai-message-time">
                          {formatMessageTime(m.sent_at)}
                          {outgoing && <span className="ml-1">{m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓'}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sysNotes.map((n) => (
                  <div key={n.id} className="flex justify-center">
                    <span className="text-[11px] text-curai-muted bg-curai-subtle px-2 py-0.5 rounded-full my-0.5">
                      {n.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* Ввод */}
              <div className="curai-chat-compose">
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
                    className="w-10 h-10 flex items-center justify-center rounded-md border border-curai-control text-curai-muted hover:bg-curai-subtle disabled:opacity-50 text-lg"
                  >
                    {uploadingFile ? '…' : <CuraiIcon name="paperclip"/>}
                  </button>

                  {attachMenuOpen && (
                    <div
                      ref={attachMenuRef}
                      className="absolute bottom-12 left-0 w-72 bg-curai-surface border border-curai-border rounded-md shadow-none z-50 overflow-hidden"
                    >
                      <div className="px-3 py-2 text-xs font-semibold text-curai-muted border-b border-curai-border">
                        Вложить файл
                      </div>

                      <div className="px-3 py-2 text-xs font-medium text-curai-muted flex items-center gap-2">
                        <span>📁</span> Из документов клиента
                      </div>

                      {loadingDocs && patientDocs.length === 0 && (
                        <div className="px-4 py-2 text-xs text-curai-muted">Загрузка документов…</div>
                      )}

                      {!loadingDocs && patientDocs.length > 0 && (
                        <div className="max-h-48 overflow-y-auto border-t border-curai-border">
                          {patientDocs.map((doc) => (
                            <button
                              key={doc.id || doc.filename}
                              onClick={() => sendExistingDoc(doc)}
                              disabled={uploadingFile}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-curai-subtle flex items-center gap-2 border-b border-curai-border"
                              title={doc.original_filename || doc.filename}
                            >
                              <span className="flex-shrink-0">📄</span>
                              <span className="flex-1 truncate">{doc.original_filename || doc.filename}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {!loadingDocs && patientDocs.length === 0 && (
                        <div className="px-3 py-2 text-xs text-curai-muted border-t border-curai-border">
                          Нет документов в карточке клиента
                        </div>
                      )}

                      <button
                        onClick={() => { setAttachMenuOpen(false); handleAttachClick(); }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-curai-subtle flex items-center gap-2 border-t border-curai-border"
                      >
                        <span>💻</span>
                        <span>
                          С компьютера
                          <span className="block text-xs text-curai-muted font-normal">выбрать и загрузить новый файл</span>
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
                  className="flex-1 px-3 py-2 border border-curai-control rounded-md resize-none focus:ring-2 focus:ring-curai-focus focus:border-transparent text-sm"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 bg-curai-positive hover:bg-curai-blue text-white rounded-md font-medium disabled:opacity-50"
                >
                  {sending ? '…' : 'Отправить'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div></div>,
    document.body
  );
};

export default WhatsAppInbox;
