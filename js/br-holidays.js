/* Feriados nacionais (Brasil) — America/Sao_Paulo, seg–sex úteis excluem estes dias */

const BrHolidays = (() => {
  const FIXED_MM_DD = new Set([
    '01-01', // Confraternização
    '04-21', // Tiradentes
    '05-01', // Trabalho
    '09-07', // Independência
    '10-12', // Nossa Senhora Aparecida
    '11-02', // Finados
    '11-15', // Proclamação da República
    '12-25', // Natal
  ]);

  function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  function ymdFromUtcDate(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addUtcDays(d, days) {
    const x = new Date(d.getTime());
    x.setUTCDate(x.getUTCDate() + days);
    return x;
  }

  function movableForYear(year) {
    const easter = easterSunday(year);
    return [
      ymdFromUtcDate(addUtcDays(easter, -48)), // Carnaval (segunda)
      ymdFromUtcDate(addUtcDays(easter, -47)), // Carnaval (terça)
      ymdFromUtcDate(addUtcDays(easter, -2)),  // Sexta-feira Santa
      ymdFromUtcDate(addUtcDays(easter, 60)),  // Corpus Christi
    ];
  }

  const cache = new Map();

  function allForYear(year) {
    if (cache.has(year)) return cache.get(year);
    const set = new Set(movableForYear(year));
    FIXED_MM_DD.forEach((mmdd) => set.add(`${year}-${mmdd}`));
    cache.set(year, set);
    return set;
  }

  function isHoliday(ymd) {
    if (!ymd || ymd.length < 10) return false;
    const year = parseInt(ymd.slice(0, 4), 10);
    if (!Number.isFinite(year)) return false;
    return allForYear(year).has(ymd);
  }

  return { isHoliday, allForYear };
})();
