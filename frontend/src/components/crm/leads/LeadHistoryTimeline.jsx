import React, { useEffect, useState } from 'react';
import { countRealCalls, historyDate, historyInquiries, historyPhones, historySources, historyStatusLabel } from '../../../utils/leadHistory.js';

export function LeadHistoryTimeline({ lead, calls = { status: 'loading', count: null } }) {
  const inquiries = historyInquiries(lead);
  return (
    <section aria-labelledby="lead-history-heading" className="text-curai-ink ">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 id="lead-history-heading" className="text-lg font-semibold">История обращений</h3>
        <div role="status" className="rounded-md bg-curai-subtle px-3 py-2 text-sm ">
          <span className="font-medium">Звонки: </span>
          {calls.status === 'loading' ? 'Загрузка…' : calls.status === 'error' ? 'Не удалось загрузить' : calls.count === null ? 'Нет номера телефона' : calls.count}
        </div>
      </div>
      <p className="mb-4 text-xs text-curai-muted ">Звонки по номерам обращений из телефонии, включая пропущенные. Обращения не считаются звонками.</p>
      {inquiries.length ? (
        <ol aria-label="Хронология обращений" className="ml-2 space-y-4 border-l-2 border-curai-border ">
          {inquiries.map(({ inquiry, primary }, index) => (
            <li key={inquiry.id || index} className="relative pl-5">
              <span aria-hidden="true" className="absolute -left-2 top-4 h-3.5 w-3.5 rounded-full border-2 border-white bg-curai-blue " />
              <article className="rounded-md border border-curai-border bg-curai-subtle p-4 ">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold">{primary ? 'Первое обращение' : 'Повторное обращение'}</h4>
                  <span className="rounded-full bg-curai-selected px-2.5 py-1 text-xs font-medium text-curai-blue ">{historySources[inquiry.source] || 'Источник не указан'}</span>
                  <span className="rounded-full bg-curai-border px-2.5 py-1 text-xs text-curai-ink ">{historyStatusLabel('lead', inquiry.status)}</span>
                </div>
                <p className="mt-2 text-xs text-curai-muted ">{historyDate(inquiry.created_at)}</p>
                {(inquiry.phone || inquiry.email) && <p className="mt-2 break-words text-sm">{[inquiry.phone, inquiry.email].filter(Boolean).join(' · ')}</p>}
                {inquiry.converted_to_appointment_id && <p className="mt-2 text-sm text-curai-positive ">Создана запись на приём</p>}
                {[...new Set([inquiry.description, inquiry.notes].filter(Boolean))].map((text, textIndex) => (
                  <p key={textIndex} className="mt-2 whitespace-pre-wrap break-words text-sm text-curai-muted ">{text}</p>
                ))}
                <details className="mt-3 text-xs text-curai-muted ">
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
      ) : <p className="py-4 text-center text-sm text-curai-muted ">Обращения не найдены</p>}
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
