import React, { useEffect, useState } from 'react';
import PanelHeader from '../common/PanelHeader';
import { apiClient, handleApiError } from '../../api/config';
import { canAction, hasPermission } from '../../utils/permissions';

const money = value => value == null ? '—' : `${Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;
const statuses = {
  accrued: 'Начислено', disabled: 'Начисления отключены',
  first_payment_already_recorded: 'Фикс уже учтён при первой оплате',
};

export default function AdminBonuses({ user, refreshVersion = 0 }) {
  const canView = canAction(user, 'admin_bonus_view', 'patients_view');
  const canManage = hasPermission(user, 'admin_bonus_manage');
  const [month, setMonth] = useState('');
  const [reportZone, setReportZone] = useState('');
  const [contextError, setContextError] = useState('');
  const [contextLoading, setContextLoading] = useState(false);
  const [employee, setEmployee] = useState('');
  const [employees, setEmployees] = useState([]);
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [setting, setSetting] = useState(null);
  const [settingError, setSettingError] = useState('');
  const [settingLoading, setSettingLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [rateType, setRateType] = useState('fixed');
  const [rateValue, setRateValue] = useState('');
  useEffect(() => {
    let current = true;
    setReportZone(''); setReport(null); setContextError('');
    if (!canView) return;
    setContextLoading(true);
    apiClient.get('/admin-bonuses/context').then(({ data }) => {
      if (!current) return;
      if (typeof data.timezone !== 'string' || !data.timezone || !/^[0-9]{4}-[0-9]{2}$/.test(data.current_month)) throw new Error('Не удалось определить часовой пояс клиники');
      new Intl.DateTimeFormat('ru-RU', { timeZone: data.timezone });
      setReportZone(data.timezone); setMonth(previous => previous || data.current_month);
    }).catch(e => { if (current) setContextError(handleApiError(e)); })
      .finally(() => { if (current) setContextLoading(false); });
    return () => { current = false; };
  }, [canView, reload]);

  useEffect(() => {
    let current = true;
    setSettingLoading(true);
    setSettingError('');
    if (!canView && !canManage) { setSettingLoading(false); return; }
    apiClient.get('/admin-bonuses/settings').then(({ data }) => {
      if (!current) return;
      setSetting(data); setEnabled(data.enabled);
      setRateType(data.rate_type || 'fixed'); setRateValue(data.rate_value ?? '');
    }).catch(e => { if (current) setSettingError(handleApiError(e)); })
      .finally(() => { if (current) setSettingLoading(false); });
    return () => { current = false; };
  }, [canView, canManage, reload]);

  useEffect(() => {
    let current = true;
    setReport(null); setError('');
    if (!canView || !month || !reportZone) { setLoading(false); return; }
    setLoading(true);
    apiClient.get('/admin-bonuses', { params: { month, employee_id: employee || undefined, offset, limit: 100 } })
      .then(({ data }) => {
        if (!current) return;
        if (!Array.isArray(data.rows) || !Array.isArray(data.employees)) throw new Error('Некорректный ответ сервера');
        if (data.timezone !== reportZone) throw new Error('Часовой пояс отчёта изменился. Обновите страницу начислений.');
        setReport(data);
        if (!employee) setEmployees(data.employees.filter(row => row.user_id));
      }).catch(e => { if (current) setError(handleApiError(e)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [canView, month, employee, offset, reload, refreshVersion, reportZone]);

  const save = async event => {
    event.preventDefault();
    setSaving(true); setSaved(false); setSettingError('');
    try {
      const { data } = await apiClient.put('/admin-bonuses/settings', {
        enabled, rate_type: rateValue === '' ? null : rateType,
        rate_value: rateValue === '' ? null : rateValue,
        expected_revision: setting?.revision ?? null,
      });
      setSetting(data); setSaved(true);
    } catch (e) { setSettingError(handleApiError(e)); }
    finally { setSaving(false); }
  };
  if (!canView && !canManage) return <p role="alert">Недостаточно прав для просмотра бонусов.</p>;

  return <section className="space-y-4 text-curai-ink">
    <PanelHeader title="Бонусы администраторам" subtitle="Начисления по сотрудникам и месяцу оплаты. Выплата денег здесь не проводится."
      actions={<button className="curai-button" onClick={() => setReload(x => x + 1)}>Обновить</button>} />
    <div className="rounded-md border border-curai-border bg-curai-surface p-4 space-y-3">
      <h3 className="font-semibold">Единая ставка для всех услуг и анализов</h3>
      {settingLoading ? <p role="status">Загрузка настройки…</p> : !setting ? <p>Настройка недоступна.</p> : canManage ? <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setSaved(false); }} />Начислять бонусы</label>
        <label className="grid gap-1">Тип ставки<select aria-label="Тип ставки" value={rateType} onChange={e => { setRateType(e.target.value); setSaved(false); }}>
          <option value="fixed">Фикс за позицию, ₸</option><option value="percentage">Процент от оплаты, %</option>
        </select></label>
        <label className="grid gap-1">Значение ставки<input aria-label="Значение ставки" type="number" min="0" max={rateType === 'percentage' ? 100 : undefined} step="0.01"
          required={enabled} value={rateValue} onChange={e => { setRateValue(e.target.value); setSaved(false); }} /></label>
        <button className="curai-button curai-button-primary" disabled={saving || !setting} type="submit">{saving ? 'Сохранение…' : 'Сохранить ставку'}</button>
      </form> : <p>{setting?.enabled ? `${setting.rate_type === 'fixed' ? 'Фикс за позицию' : 'Процент от оплаты'}: ${setting.rate_type === 'fixed' ? money(setting.rate_value) : `${setting.rate_value}%`}` : 'Начисления отключены. Ставка по умолчанию не задана.'}</p>}
      <p className="text-sm text-curai-muted">Получатель — сотрудник, принявший оплату под своим аккаунтом. Фикс начисляется один раз при первой оплате позиции. Изменение ставки действует на новые оплаты; история сохраняется. Старые платежи автоматически не пересчитываются.</p>
      {settingError && <p role="alert">{settingError} <button className="curai-button" onClick={() => setReload(x => x + 1)}>Загрузить актуальную ставку</button></p>}
      {saved && <p role="status">Ставка сохранена. Прошлые начисления сохранены.</p>}
    </div>
    {canView && <>
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1">Месяц оплаты ({reportZone || 'часовой пояс клиники'})<input type="month" disabled={contextLoading || !reportZone} value={month} onChange={e => { if (e.target.value) { setMonth(e.target.value); setEmployee(''); setOffset(0); } }} /></label>
        <label className="grid gap-1">Сотрудник<select value={employee} onChange={e => { setEmployee(e.target.value); setOffset(0); }}>
          <option value="">Все сотрудники</option>{employees.map(row => <option key={row.user_id} value={row.user_id}>{row.employee_name}</option>)}
        </select></label>
      </div>
      {contextLoading && <p role="status">Загрузка часового пояса клиники…</p>}
      {contextError && <p role="alert">{contextError}</p>}
      {loading && <p role="status">Загрузка начислений…</p>}
      {error && <p role="alert">{error}</p>}
      {report && <>
        <div className="flex flex-wrap gap-3" aria-label="Итоги по сотрудникам">{report.employees.map(row => <div key={row.user_id || 'unknown'} className="rounded-md border border-curai-border p-3">
          <p>{row.employee_name || 'Сотрудник не найден'}</p><strong>{money(row.bonus_amount_kzt)}</strong>
        </div>)}</div>
        {!report.rows.length ? <p>За выбранный месяц начислений нет.</p> : <div className="overflow-x-auto rounded-md border border-curai-border"><table className="w-full text-sm text-left">
          <caption className="sr-only">Начисления за {month}</caption>
          <thead><tr>{[`Дата оплаты (${reportZone})`, 'Сотрудник', 'Пациент', 'Позиция', 'Оплата', 'Ставка', 'Бонус', 'Состояние'].map(title => <th key={title} className="p-3">{title}</th>)}</tr></thead>
          <tbody>{report.rows.map(row => <tr key={row.event_id} className="border-t border-curai-border">
            <td className="p-3">{new Date(row.paid_at).toLocaleString('ru-RU', { timeZone: reportZone })}</td>
            <td className="p-3">{row.employee_name || 'Сотрудник не найден'}</td><td className="p-3">{row.patient_name}</td>
            <td className="p-3">{row.service_name}<div className="text-xs text-curai-muted">План: {row.plan_id} · Позиция: {row.service_row_id}{row.component_id && ` · Компонент: ${row.component_id}`}{row.session_id && ` · Сеанс: ${row.session_id}`}</div></td>
            <td className="p-3">{money(row.basis_amount_kzt)}<div>{row.payment_method}</div><div className="text-xs text-curai-muted">{row.event_id}</div></td>
            <td className="p-3">{row.rate_type === 'percentage' ? `${row.rate_value}%` : money(row.rate_value)}</td>
            <td className="p-3">{money(row.amount_kzt)}</td><td className="p-3">{statuses[row.status] || row.status}</td>
          </tr>)}</tbody>
        </table></div>}
        <div className="flex items-center gap-3"><button className="curai-button" disabled={!offset} onClick={() => setOffset(x => Math.max(0, x - 100))}>Назад</button>
          <span>Записей: {report.total}</span><button className="curai-button" disabled={offset + 100 >= report.total} onClick={() => setOffset(x => x + 100)}>Далее</button></div>
      </>}
    </>}
  </section>;
}
