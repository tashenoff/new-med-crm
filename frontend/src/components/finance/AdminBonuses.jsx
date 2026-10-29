import React, { useEffect, useState } from 'react';
import PanelHeader from '../common/PanelHeader';
import CuraiIcon from '../common/CuraiIcon';
import LoadingIndicator from '../common/LoadingIndicator';
import './AdminBonuses.css';
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
  if (!canView && !canManage) return <div className="curai-admin-bonuses"><div role="alert" className="curai-bonus-message is-error"><CuraiIcon name="lock" />Недостаточно прав для просмотра бонусов.</div></div>;

  return <section className="curai-admin-bonuses">
    <PanelHeader title="Бонусы администраторам" subtitle="Настройка единой ставки и начисления по сотрудникам за месяц оплаты."
      actions={<button className="curai-button curai-button-secondary" onClick={() => setReload(x => x + 1)}><CuraiIcon name="clock" />Обновить</button>} />

    <section className="curai-bonus-card" aria-labelledby="bonus-setting-title" aria-busy={settingLoading}>
      <header className="curai-bonus-card-heading">
        <div className="curai-bonus-heading"><span className="curai-bonus-icon"><CuraiIcon name="settings" /></span><div>
          <h3 id="bonus-setting-title">Единая ставка для всех услуг и анализов</h3>
          <p>Применяется к новым оплатам после сохранения.</p>
        </div></div>
        {setting && <span className={`curai-bonus-badge ${setting.enabled ? 'is-accrued' : 'is-disabled'}`}>{setting.enabled ? 'Начисления включены' : 'Начисления отключены'}</span>}
      </header>
      <div className="curai-bonus-card-body">
        {settingLoading ? <LoadingIndicator label="Загрузка настройки…" /> : !setting ? <div className="curai-bonus-state"><CuraiIcon name="settings" /><p>Настройка недоступна.</p></div> : <div className="curai-bonus-setting-layout">
          {canManage ? <form onSubmit={save} className="curai-bonus-form">
            <label className="curai-bonus-enable"><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setSaved(false); }} /><span>Включить бонусы</span></label>
            <div className="curai-bonus-fields">
              <label className="curai-bonus-field">Тип ставки<select aria-label="Тип ставки" value={rateType} onChange={e => { setRateType(e.target.value); setSaved(false); }}>
                <option value="fixed">Фикс за позицию, ₸</option><option value="percentage">Процент от оплаты, %</option>
              </select></label>
              <label className="curai-bonus-field">Значение ставки<input aria-label="Значение ставки" type="number" min="0" max={rateType === 'percentage' ? 100 : undefined} step="0.01"
                required={enabled} value={rateValue} onChange={e => { setRateValue(e.target.value); setSaved(false); }} /></label>
            </div>
            <div className="curai-bonus-form-footer"><button className="curai-button curai-button-primary" disabled={saving || !setting} type="submit"><CuraiIcon name="check" />{saving ? 'Сохранение…' : 'Сохранить ставку'}</button></div>
          </form> : <div className="curai-bonus-current-rate">
            <span>Текущая ставка</span>
            <strong>{setting.enabled ? (setting.rate_type === 'fixed' ? money(setting.rate_value) : `${setting.rate_value}%`) : 'Не применяется'}</strong>
            <p>{setting.enabled ? (setting.rate_type === 'fixed' ? 'Фикс за позицию' : 'Процент от оплаты') : 'Начисления отключены.'}</p>
          </div>}
          <aside className="curai-bonus-note" aria-label="Правила начисления">
            <h4>Как начисляются бонусы</h4>
            <p>Получатель — сотрудник, принявший оплату под своим аккаунтом.</p>
            <p>Фикс учитывается один раз при первой оплате позиции. Процент — от суммы каждого платежа по позиции.</p>
            <p>Изменение ставки действует на новые оплаты. История сохраняется; старые платежи не пересчитываются.</p>
          </aside>
        </div>}
        {settingError && <div role="alert" className="curai-bonus-message is-error"><CuraiIcon name="attention" /><div><p>{settingError}</p><button className="curai-button curai-button-secondary" onClick={() => setReload(x => x + 1)}>Загрузить актуальную ставку</button></div></div>}
        {saved && <div role="status" className="curai-bonus-message is-success"><CuraiIcon name="check" />Ставка сохранена. Прошлые начисления сохранены.</div>}
      </div>
    </section>

    {canView && <section className="curai-bonus-card" aria-labelledby="bonus-register-title" aria-busy={contextLoading || loading}>
      <header className="curai-bonus-card-heading"><div className="curai-bonus-heading"><span className="curai-bonus-icon"><CuraiIcon name="finance-reports" /></span><div>
        <h3 id="bonus-register-title">Реестр начислений</h3><p>Оплаты и бонусы за выбранный месяц. Выплата денег здесь не проводится.</p>
      </div></div></header>
      <div className="curai-bonus-filters">
        <label className="curai-bonus-field">Месяц оплаты<input aria-label="Месяц оплаты" type="month" disabled={contextLoading || !reportZone} value={month} onChange={e => { if (e.target.value) { setMonth(e.target.value); setEmployee(''); setOffset(0); } }} /></label>
        <label className="curai-bonus-field">Сотрудник<select aria-label="Сотрудник" value={employee} onChange={e => { setEmployee(e.target.value); setOffset(0); }}>
          <option value="">Все сотрудники</option>{employees.map(row => <option key={row.user_id} value={row.user_id}>{row.employee_name}</option>)}
        </select></label>
      </div>
      {(contextLoading || loading || contextError || error) && <div className="curai-bonus-card-body">
        {contextLoading && <LoadingIndicator label="Подготовка отчёта…" />}
        {loading && <LoadingIndicator label="Загрузка начислений…" />}
        {contextError && <div role="alert" className="curai-bonus-message is-error"><CuraiIcon name="attention" /><p>{contextError}</p></div>}
        {error && <div role="alert" className="curai-bonus-message is-error"><CuraiIcon name="attention" /><p>{error}</p></div>}
      </div>}
      {report && <>
        {!!report.employees.length && <div className="curai-bonus-summary" aria-label="Итоги по сотрудникам">{report.employees.map(row => <div key={row.user_id || 'unknown'} className="curai-bonus-employee">
          <span className="curai-bonus-icon"><CuraiIcon name="person" /></span><div><p>{row.employee_name || 'Сотрудник не определён'}</p><strong>{money(row.bonus_amount_kzt)}</strong></div>
        </div>)}</div>}
        {!report.rows.length ? <div className="curai-bonus-state"><span className="curai-bonus-empty-icon"><CuraiIcon name="finance-admin-bonuses" /></span><h4>За выбранный месяц начислений нет.</h4><p>Здесь появятся новые оплаты по позициям и связанные с ними бонусы.</p></div> : <>
          <p className="curai-bonus-table-hint"><CuraiIcon name="arrow-right" />Прокрутите таблицу, чтобы увидеть все столбцы.</p>
          <div className="curai-bonus-table-scroll" tabIndex={0} role="region" aria-label="Таблица начислений">
          <table className="curai-bonus-table"><caption className="sr-only">Начисления за {month}</caption>
            <thead><tr>{['Дата оплаты', 'Сотрудник', 'Пациент', 'Позиция', 'Платёж', 'Ставка', 'Бонус', 'Состояние'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
            <tbody>{report.rows.map(row => <tr key={row.event_id}>
              <td className="curai-bonus-date">{new Date(row.paid_at).toLocaleString('ru-RU', { timeZone: reportZone })}</td>
              <td>{row.employee_name || 'Сотрудник не определён'}</td><td>{row.patient_name}</td>
              <td><strong className="curai-bonus-position">{row.service_name}</strong><div className="curai-bonus-detail">План: {row.plan_id} · Позиция: {row.service_row_id}{row.component_id && ` · Компонент: ${row.component_id}`}{row.session_id && ` · Сеанс: ${row.session_id}`}</div></td>
              <td><span className="curai-bonus-amount">{money(row.basis_amount_kzt)}</span><div className="curai-bonus-detail">{row.payment_method}</div><div className="curai-bonus-detail">{row.event_id}</div></td>
              <td className="curai-bonus-amount">{row.rate_type === 'percentage' ? `${row.rate_value}%` : money(row.rate_value)}</td>
              <td className="curai-bonus-earned curai-bonus-amount">{money(row.amount_kzt)}</td><td><span className={`curai-bonus-badge is-${row.status}`}>{statuses[row.status] || row.status}</span></td>
            </tr>)}</tbody>
          </table>
        </div></>}
        <footer className="curai-bonus-pagination"><span>Записей: {report.total}</span><div>
          <button className="curai-button curai-button-secondary" disabled={!offset} onClick={() => setOffset(x => Math.max(0, x - 100))}><CuraiIcon name="arrow-left" />Назад</button>
          <button className="curai-button curai-button-secondary" disabled={offset + 100 >= report.total} onClick={() => setOffset(x => x + 100)}>Далее<CuraiIcon name="arrow-right" /></button>
        </div></footer>
      </>}
    </section>}
  </section>;
}
