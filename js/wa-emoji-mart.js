/**
 * Emoji Mart — picker lazy via CDN (sem npm/bundle).
 * Expõe window.WaEmojiMart.mount(container, { onSelect, theme }).
 */
const CDN_DATA = 'https://cdn.jsdelivr.net/npm/@emoji-mart/data@1.2.1/+esm';
const CDN_PICKER = 'https://cdn.jsdelivr.net/npm/emoji-mart@5.6.0/+esm';
const CDN_I18N = 'https://cdn.jsdelivr.net/npm/@emoji-mart/data@1.2.1/i18n/pt.json';

let _bundlePromise = null;

function loadBundle() {
  if (!_bundlePromise) {
    _bundlePromise = Promise.all([
      import(CDN_DATA),
      import(CDN_PICKER),
      fetch(CDN_I18N).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([dataMod, pickerMod, i18n]) => ({
      data: dataMod.default,
      Picker: pickerMod.Picker,
      i18n,
    }));
  }
  return _bundlePromise;
}

/**
 * @param {HTMLElement} container
 * @param {{ onSelect?: (native: string) => void, theme?: 'light'|'dark'|'auto' }} options
 */
export async function mount(container, options = {}) {
  if (!container) return null;
  const { data, Picker, i18n } = await loadBundle();
  container.innerHTML = '';
  const picker = new Picker({
    data,
    i18n: i18n || undefined,
    locale: i18n ? 'pt' : 'en',
    theme: options.theme || 'dark',
    onEmojiSelect: (emoji) => {
      const native = emoji?.native || emoji?.emoji || '';
      if (native && typeof options.onSelect === 'function') options.onSelect(native);
    },
    previewPosition: 'none',
    skinTonePosition: 'search',
    navPosition: 'bottom',
    perLine: 8,
    maxFrequentRows: 2,
    searchPosition: 'sticky',
  });
  container.appendChild(picker);
  return picker;
}

window.WaEmojiMart = { mount, loadBundle };
