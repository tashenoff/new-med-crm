// Модуль управления WebRTC-виджетом Zadarma.
// Кнопка-трубка открывает напрямую софтфон Zadarma (без лишнего drawer'а).
import { telephonyApi } from "../../../api/telephony";

const ZADARMA_WIDGET_BASE = "https://my.zadarma.com/webphoneWebRTCWidget/v8/js";
const ZADARMA_WIDGET_VERSION = "23";
const SIP_LOGIN = "596634-100";

let _widgetReady = false;
let _zadarmaKey = null;
let _initPromise = null;

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });

export async function showZadarmaWidget(position = "{left:'8px',bottom:'90px'}") {
  if (_widgetReady) {
    // виджет уже показан — просто возвращаемся
    return;
  }
  if (!_initPromise) {
    _initPromise = (async () => {
      const data = await telephonyApi.getWebrtcKey();
      if (!data?.key) throw new Error("Не удалось получить ключ WebRTC от Zadarma");
      _zadarmaKey = data.key;
      await loadScript(`${ZADARMA_WIDGET_BASE}/loader-phone-lib.js?v=${ZADARMA_WIDGET_VERSION}`);
      await loadScript(`${ZADARMA_WIDGET_BASE}/loader-phone-fn.js?v=${ZADARMA_WIDGET_VERSION}`);
      if (typeof window.zadarmaWidgetFn !== "function") {
        throw new Error("Виджет Zadarma не загрузился");
      }
      window.zadarmaWidgetFn(_zadarmaKey, SIP_LOGIN, "square", "ru", true, position);
      _widgetReady = true;
    })();
  }
  await _initPromise;
}

export function isZadarmaWidgetVisible() {
  return _widgetReady && !!document.querySelector(".zdrm-phone");
}

export function hideZadarmaWidget() {
  // Виджет Задармы сам управляет показом; при желании можно скрыть его класс-ом.
  const el = document.querySelector(".zdrm-phone");
  if (el) el.classList.add("zdrm-webphone-hide");
}

// Сброс (использовать только в редких тестах)
export function __resetZadarmaWidgetForTest() {
  _widgetReady = false;
  _initPromise = null;
}
