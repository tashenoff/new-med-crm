import React, { useEffect, useState } from 'react';
import { countRealCalls, historyDate, historyInquiries, historyPhones, historySources, historyStatusLabel } from '../../../utils/leadHistory.js';

export function LeadHistoryTimeline({ lead, calls = { status: 'loading', count: null } }) {
  const inquiries = historyInquiries(lead);
  return (
    <section aria-labelledby="lead-history-heading" className="text-gray-900 dark:text-gray-100">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 id="lead-history-heading" className="text-lg font-semibold">История обращений</h3>
        <div role="status" className="rounded-lg bg-gray-100 px-3 py-2 text-sm dark:bg-gray-700">
          <span className="font-medium">Звонки: </span>
          {calls.status === 'loading' ? 'Загрузка…' : calls.status === 'error' ? 'Не удалось загрузить' : calls.count === null ? 'Нет номера телефона' : calls.count}
        </div>
      </div>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">Звонки по номерам обращений из телефонии, включая пропущенные. Обращения не считаются звонками.</p>
      {inquiries.length ? (
        <ol aria-label="Хронология обращений" className="ml-2 space-y-4 border-l-2 border-gray-200 dark:border-gray-700">
          {inquiries.map(({ inquiry, primary }, index) => (
            <li key={inquiry.id || index} className="relative pl-5">
              <span aria-hidden="true" className="absolute -left-2 top-4 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 dark:border-gray-800" />
              <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold">{primary ? 'Первое обращение' : 'Повторное обращение'}</h4>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">{historySources[inquiry.source] || 'Источник не указан'}</span>
                  <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">{historyStatusLabel('lead', inquiry.status)}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{historyDate(inquiry.created_at)}</p>
                {(inquiry.phone || inquiry.email) && <p className="mt-2 break-words text-sm">{[inquiry.phone, inquiry.email].filter(Boolean).join(' · ')}</p>}
                {inquiry.converted_to_appointment_id && <p className="mt-2 text-sm text-green-700 dark:text-green-300">Создана запись на приём</p>}
                {[...new Set([inquiry.description, inquiry.notes].filter(Boolean))].map((text, textIndex) => (
                  <p key={textIndex} className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-600 dark:text-gray-300">{text}</p>
                ))}
                <details className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Технические данные</summary>
                  <dl className="mt-2 space-y-1 break-all">
                    {[
                      ['ID обращения', inquiry.id], ['ID источника', inquiry.source_id],
                      ['Код источника', inquiry.source], ['Код статуса', inquiry.status],
                      ['ID записи', inquiry.converted_to_appointment_id]
                    ].filter(([, value]) => value).map(([label, value]) => (
                      <div key={label}><dt className="inline font-medium">{label}: </dt><dd className="inline">{value}</dd></div>
                    ))}
                  </dl>
                </details>
              </article>
            </li>
          ))}
        </ol>
      ) : <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">Обращения не найдены</p>}
    </section>
  );
}

export default function LeadHistory({ lead, fetchCalls }) {
  const phoneKey = historyPhones(lead).join(',');
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    countRealCalls(fetchCalls, phoneKey ? phoneKey.split(',') : []).then(count => {
      if (active) setResult({ key: phoneKey, status: 'ready', count });
    }).catch(() => {
      if (active) setResult({ key: phoneKey, status: 'error', count: null });
    });
    return () => { active = false; };
  }, [phoneKey, fetchCalls]);
  return <LeadHistoryTimeline lead={lead} calls={result?.key === phoneKey ? result : undefined} />;
}
