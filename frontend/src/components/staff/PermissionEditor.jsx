import React, { useState } from 'react';
import axios from 'axios';
import { permissionGroups, permissionLabel } from '../../utils/permissions';

export default function PermissionEditor({ form, onChange }) {
  const [error, setError] = useState('');
  const selected = form.custom_permissions || [];
  const replace = permissions => onChange({ ...form, permission_mode: 'explicit', custom_permissions: [...new Set(permissions)] });
  const applyPreset = async () => {
    setError('');
    try {
      const { data } = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/staff/roles/permissions/${form.role}`);
      if (!Array.isArray(data)) throw new Error();
      replace(data.filter(key => key !== 'payroll_view'));
    } catch { setError('Не удалось загрузить шаблон роли. Выбранные права сохранены.'); }
  };
  return <section className="space-y-4" aria-label="Права доступа">
    <p className="text-sm">Сохраняется только выбранный набор. Смена роли не добавляет права.</p>
    <p className="text-xs">Создание, изменение, удаление и экспорт также требуют просмотра соответствующего раздела. Они не включают его автоматически.</p>
    <p className="text-xs">«Создание врача» позволяет добавить карточку врача. Настройка оплаты требует отдельного разрешения «Зарплаты».</p>
    <div className="flex gap-3">
      <button className="px-3 py-2 border border-curai-control rounded-md" type="button" onClick={applyPreset} disabled={!form.role}>Применить шаблон роли</button>
      <button className="px-3 py-2 border border-curai-control rounded-md" type="button" onClick={() => replace([])}>Снять все права</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {permissionGroups.map(group => <fieldset key={group.key} className="border border-curai-border rounded-md p-3">
      <legend className="font-semibold">{group.title}</legend>
      {group.rows.map(([label, keys]) => <div key={label} className="my-3">
        <div className="text-sm font-medium">{label}</div>
        <div className="flex flex-wrap gap-4 mt-1">{keys.map(key => <label key={key} className="text-sm flex gap-2 items-center">
          <input type="checkbox" name={key} checked={selected.includes(key)} onChange={e => replace(e.target.checked ? [...selected, key] : selected.filter(p => p !== key))} />
          {permissionLabel(key)}
        </label>)}</div>
      </div>)}
      {group.key === 'finance' && <p className="text-xs">Доходы, расходы и часть отчётов пока демонстрационные. Разрешение не означает готовность раздела. Зарплаты выдаются отдельно.</p>}
    </fieldset>)}
    <p className="text-xs">¹ Управление доступом дополнительно требует административной роли. ² Просмотр зарплат не выдаётся шаблоном роли. Экспорт применяется там, где операция реализована; новые разделы эти флажки не создают.</p>
  </section>;
}
