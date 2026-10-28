/*
 * Med Vision — віджет онлайн-запису для сайту клініки (T9.1.5).
 *
 * Окремий файл без Angular: вантажиться на чужому сайті, тож має бути малим і
 * нічого не ламати навколо. Роздається як статичний ресурс (`public/` → корінь
 * збірки), адреса — `{база застосунку}widget/booking-widget.js`.
 *
 * Що вміє:
 *  - `<script ... data-medvision-booking="{pageKey}" data-mode="button">` —
 *    малює кнопку «Записатися» (у місці вставки або плаваючу в куті) і відкриває
 *    сторінку запису в модальному вікні поверх сайту;
 *  - для `<iframe data-medvision-booking>` — «авто по висоті»: сторінка запису
 *    повідомляє висоту вмісту, рамка підлаштовується;
 *  - запис створено → подія `medvision:booked` на `window` сайту
 *    (`event.detail = { code, pageKey }`);
 *  - `data-widget="callback"` (T9.1.6) — той самий віджет, але у вікні форма
 *    «Передзвоніть мені» (`?widget=callback`); заявку надіслано → подія
 *    `medvision:callback` (`event.detail = { pageKey }`).
 *
 * Тема й текст кнопки читаються зі збереженої конфігурації
 * `GET /api/v1/online-booking/public/{pageKey}/widget`; `data-*` у коді — лише
 * запасні значення. Протокол повідомлень — `booking-widget.ts` (джерело
 * `medvision-booking`, типи `height` і `booked`); міняти лише разом.
 */
(function () {
  'use strict';

  var SOURCE = 'medvision-booking';
  var script = document.currentScript;
  if (!script || !script.src) return;

  var base = new URL('..', script.src).href;
  var origin = new URL(base).origin;

  // --- Спільний слухач повідомлень (один на сторінку, навіть із кількома вставками) ---
  var registry = (window.__medvisionBooking = window.__medvisionBooking || { frames: [], listening: false });

  if (!registry.listening) {
    registry.listening = true;
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (!data || data.source !== SOURCE) return;
      var frames = registry.frames.concat(
        Array.prototype.slice.call(document.querySelectorAll('iframe[data-medvision-booking]'))
      );
      for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        if (frame.contentWindow !== event.source) continue;
        if (new URL(frame.src, location.href).origin !== event.origin) return;
        if (data.type === 'height' && !frame.hasAttribute('data-medvision-modal') && data.height > 0) {
          frame.style.height = Math.ceil(data.height) + 'px';
        }
        if (data.type === 'booked') {
          window.dispatchEvent(
            new CustomEvent('medvision:booked', {
              detail: { code: data.code, pageKey: frame.getAttribute('data-medvision-booking') }
            })
          );
        }
        if (data.type === 'callback-sent') {
          window.dispatchEvent(
            new CustomEvent('medvision:callback', {
              detail: { pageKey: frame.getAttribute('data-medvision-booking') }
            })
          );
        }
        return;
      }
    });
  }

  var pageKey = script.getAttribute('data-medvision-booking');
  if (!pageKey || script.getAttribute('data-mode') !== 'button') return;

  var callback = script.getAttribute('data-widget') === 'callback';
  var label = callback ? 'Передзвоніть мені' : 'Онлайн-запис на прийом';

  var fallback = {
    buttonText: script.getAttribute('data-text') || (callback ? 'Передзвоніть мені' : 'Записатися на прийом'),
    buttonPosition: (script.getAttribute('data-position') || 'inline').toUpperCase(),
    buttonSize: (script.getAttribute('data-size') || 'medium').toUpperCase(),
    theme: { accent: null, button: null, radius: 8 }
  };

  // Той самий список, що WIDGET_BUTTON_FONTS у booking-widget.ts.
  var fonts = {
    SITE: 'inherit',
    SANS: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    SERIF: 'Georgia, "Times New Roman", serif'
  };

  function isHex(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  }

  // Білий або майже чорний текст — що контрастніше до кольору кнопки (WCAG).
  function onColor(hex) {
    function lum(h) {
      var c = [1, 3, 5].map(function (o) {
        var v = parseInt(h.slice(o, o + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    var l = lum(hex);
    return (1.05 / (l + 0.05)) >= ((l + 0.05) / (lum('#1a1b1f') + 0.05)) ? '#ffffff' : '#1a1b1f';
  }

  var modal = null;

  function openModal() {
    if (!modal) modal = buildModal();
    modal.overlay.style.display = 'flex';
    modal.previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    modal.close.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.overlay.style.display = 'none';
    document.documentElement.style.overflow = modal.previousOverflow || '';
  }

  function buildModal() {
    var narrow = window.matchMedia('(max-width: 600px)').matches;
    var overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', label);
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.5);padding:' + (narrow ? '0' : '16px') + ';box-sizing:border-box';

    var box = document.createElement('div');
    box.style.cssText =
      'position:relative;width:100%;max-width:760px;height:100%;max-height:' + (narrow ? 'none' : callback ? '640px' : '900px') +
      ';background:#fff;border-radius:' + (narrow ? '0' : '8px') + ';overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.3)';

    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрити');
    close.textContent = '×';
    close.style.cssText =
      'position:absolute;top:6px;right:6px;z-index:1;width:36px;height:36px;border:0;border-radius:50%;' +
      'background:rgba(0,0,0,.55);color:#fff;font:24px/36px sans-serif;cursor:pointer;padding:0';

    var frame = document.createElement('iframe');
    frame.src = base + 'booking/' + encodeURIComponent(pageKey) + '?embed=1' + (callback ? '&widget=callback' : '');
    frame.title = label;
    frame.setAttribute('data-medvision-booking', pageKey);
    frame.setAttribute('data-medvision-modal', '');
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
    registry.frames.push(frame);

    close.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && overlay.style.display !== 'none') closeModal();
    });

    box.appendChild(close);
    box.appendChild(frame);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return { overlay: overlay, close: close, previousOverflow: '' };
  }

  function renderButton(config) {
    // «Передзвоніть мені» має власний вигляд — кнопку, розмір, положення й тему (T9.1.6).
    if (callback && config.callback) config = config.callback;
    var theme = config.theme || fallback.theme;
    // Темна тема — для схеми DARK і для AUTO, коли в системі відвідувача темна.
    var dark = theme.dark && (theme.scheme === 'DARK' ||
      (theme.scheme === 'AUTO' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches));
    var colors = dark ? theme.dark : theme;
    var color = isHex(colors.button) ? colors.button : isHex(colors.accent) ? colors.accent : dark ? '#7cc4ff' : '#0b6e99';
    var radius = typeof theme.radius === 'number' ? Math.max(0, Math.min(24, theme.radius)) : 8;
    var padding = { SMALL: '6px 12px', MEDIUM: '10px 18px', LARGE: '14px 26px' }[config.buttonSize] || '10px 18px';
    var fontSize = { SMALL: '14px', MEDIUM: '16px', LARGE: '18px' }[config.buttonSize] || '16px';
    // Оформлення кнопки (2026-10-28); без нього — як було: без рамки, 600, з тінню.
    var look = config.buttonStyle || {};
    // Текст і рамка кнопки — з кольорів теми, як фон.
    var text = isHex(colors.buttonText) ? colors.buttonText : onColor(color);
    var borderWidth = typeof look.borderWidth === 'number' ? Math.max(0, Math.min(6, look.borderWidth)) : 0;
    var border = borderWidth ? borderWidth + 'px solid ' + (isHex(colors.buttonBorder) ? colors.buttonBorder : text) : '0';
    var weight = [400, 600, 700].indexOf(look.fontWeight) >= 0 ? look.fontWeight : 600;
    var family = fonts[look.font] || fonts.SANS;

    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = config.buttonText || fallback.buttonText;
    button.style.cssText =
      'display:inline-block;box-sizing:border-box;cursor:pointer;border:' + border + ';' +
      'background:' + color + ';color:' + text + ';border-radius:' + radius + 'px;padding:' + padding +
      ';box-shadow:' + (look.shadow === false ? 'none' : '0 2px 8px rgba(0,0,0,.2)') + ';max-width:calc(100vw - 32px)';
    // `font` окремо: з family в лапках cssText-рядок легко зламати.
    button.style.font = weight + ' ' + fontSize + '/1.2 ' + family;
    button.addEventListener('click', openModal);

    if (config.buttonPosition === 'FLOATING') {
      button.style.position = 'fixed';
      button.style.right = '16px';
      button.style.bottom = '16px';
      button.style.zIndex = '2147482999';
      document.body.appendChild(button);
    } else {
      script.parentNode.insertBefore(button, script);
    }
  }

  function start() {
    var url = origin + '/api/v1/online-booking/public/' + encodeURIComponent(pageKey) + '/widget';
    fetch(url, { credentials: 'omit' })
      .then(function (response) {
        // 403 — сайт не в списку дозволених доменів: кнопки не буде.
        if (response.status === 403) return null;
        return response.ok ? response.json() : fallback;
      })
      .catch(function () {
        return fallback;
      })
      .then(function (config) {
        if (config) renderButton(config);
      });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
