import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { telephonyApi, handleApiError } from "../../../api/telephony";
import { useAuth } from "../../../context/AuthContext";

const TABS = [
  { key: "dial", label: "Набор" },
  { key: "history", label: "История звонков" },
];

const directionLabel = (d) => {
  if (d === "inbound") return "Входящий";
  if (d === "outbound") return "Исходящий";
  return d || "—";
};

const statusLabel = (s) => {
  switch (s) {
    case "answered": return "Отвечен";
    case "missed": return "Пропущен";
    case "rejected": return "Отклонён";
    case "busy": return "Занято";
    case "failed": return "Ошибка";
    default: return s || "—";
  }
};

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizePhoneInput = (value) => {
  return value.replace(/[^\d\s+\-()]/g, "");
};

const ZADARMA_WIDGET_BASE = "https://my.zadarma.com/webphoneWebRTCWidget/v8/js";
const ZADARMA_WIDGET_VERSION = "23";
const SIP_LOGIN = "596634-100";

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.body.appendChild(script);
  });

const DialerWidget = ({ isOpen, onClose, initialPhone = "" }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState("dial");
  const [phone, setPhone] = useState(initialPhone);
  const [status, setStatus] = useState(null);
  const [calling, setCalling] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const [calls, setCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const initPromiseRef = useRef(null);

  const loadCalls = useCallback(async () => {
    if (!user?.id) return;
    setLoadingCalls(true);
    try {
      const data = await telephonyApi.getCalls({ user_id: String(user.id), limit: 50 });
      const list = Array.isArray(data) ? data : data?.calls || [];
      setCalls(list);
    } catch (err) {
      setStatus({ type: "error", message: handleApiError(err) });
    } finally {
      setLoadingCalls(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setStatus(null);
    if (tab === "history") {
      loadCalls();
    }
  }, [isOpen, tab, loadCalls]);

  useEffect(() => {
    setPhone((prev) => prev || initialPhone || "");
  }, [initialPhone]);

  const initWidget = async () => {
    if (widgetReady) return;
    if (initPromiseRef.current) return initPromiseRef.current;

    initPromiseRef.current = (async () => {
      const { key } = await telephonyApi.getWebrtcKey();

      await loadScript(
        `${ZADARMA_WIDGET_BASE}/loader-phone-lib.js?v=${ZADARMA_WIDGET_VERSION}`
      );
      await loadScript(
        `${ZADARMA_WIDGET_BASE}/loader-phone-fn.js?v=${ZADARMA_WIDGET_VERSION}`
      );

      if (typeof window.zadarmaWidgetFn !== "function") {
        throw new Error("Виджет Zadarma не загрузился");
      }

      window.zadarmaWidgetFn(
        key,
        SIP_LOGIN,
        "square",
        "ru",
        true,
        "{right:\'8px\',bottom:\'140px\'}"
      );

      setWidgetReady(true);
    })();

    try {
      await initPromiseRef.current;
    } finally {
      initPromiseRef.current = null;
    }
  };

  const trySetWidgetNumber = (number) => {
    // Виджет рендерится внутри iframe; публичного API набора номера нет.
    // Пробуем найти input внутри iframe и вставить номер.
    try {
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) continue;
        const input =
          doc.querySelector("input[type=tel]") ||
          doc.querySelector("input[type=text]") ||
          doc.querySelector("input[placeholder*=\'номер\' i]") ||
          doc.querySelector("input");
        if (input) {
          input.focus();
          input.value = number;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
          return true;
        }
      }
    } catch (e) {
      // cross-origin iframe — игнорируем
    }
    return false;
  };

  const handleCall = async () => {
    const cleaned = phone.replace(/\s+/g, "").trim();
    if (!cleaned) {
      setStatus({ type: "error", message: "Введите номер телефона" });
      return;
    }
    setCalling(true);
    setStatus(null);
    try {
      await initWidget();
      const dialed = trySetWidgetNumber(cleaned);
      if (dialed) {
        setStatus({ type: "success", message: "Набираем в виджете Zadarma" });
      } else {
        setStatus({
          type: "success",
          message: "Виджет Zadarma готов. Нажмите вызов в виджете или наберите номер вручную.",
        });
      }
      if (tab === "history") {
        loadCalls();
      }
    } catch (err) {
      setStatus({ type: "error", message: handleApiError(err) });
    } finally {
      setCalling(false);
    }
  };

  const handleHistoryClick = (number) => {
    setPhone(number);
    setTab("dial");
    setStatus(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleCall();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed bottom-0 right-0 top-0 z-[60] flex flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700"
      style={{ width: "min(400px, 96vw)" }}
    >
      {/* Шапка */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="flex items-center gap-2">
          <span className="text-xl">📞</span>
          <h3 className="font-semibold">Телефония</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg" title="Закрыть">
          ✖️
        </button>
      </div>

      {/* Вкладки */}
      <div className="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Статус */}
      {status && (
        <div
          className={`flex-shrink-0 mx-3 mt-2 px-3 py-2 rounded-lg text-sm ${
            status.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {status.type === "success" ? "✅" : "⚠️"} {status.message}
        </div>
      )}

      {/* Содержимое */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === "dial" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Номер телефона
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
                onKeyDown={handleKeyDown}
                placeholder="+7..."
                disabled={calling}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCall}
                disabled={calling}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
                {calling ? "Готовим виджет…" : "Позвонить"}
              </button>
              <button
                onClick={() => { setPhone(""); setStatus(null); }}
                disabled={calling}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium"
              >
                Сбросить
              </button>
            </div>

            {widgetReady && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Виджет Zadarma активен в правом нижнем углу. Разрешите доступ к микрофону при первом звонке.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {loadingCalls && calls.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-6">Загрузка…</div>
            )}
            {!loadingCalls && calls.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-6">История звонков пуста</div>
            )}
            {calls.map((call) => (
              <div
                key={call._id || call.id}
                className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => handleHistoryClick(call.phone_number)}
                    className="text-blue-600 dark:text-blue-400 font-medium text-sm hover:underline"
                    title="Позвонить по этому номеру"
                  >
                    {call.phone_number}
                  </button>
                  <span className="text-xs text-gray-400">{formatDate(call.created_at)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {directionLabel(call.direction)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {statusLabel(call.status)}
                  </span>
                  <span>Длительность: {formatDuration(call.duration)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default DialerWidget;
