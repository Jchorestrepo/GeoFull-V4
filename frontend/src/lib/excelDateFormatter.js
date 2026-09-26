/**
 * Convierte cualquier valor numérico de serie de fecha de Excel (ej: 46279.70549768519)
 * o un objeto Date de JS en una cadena legible "YYYY-MM-DD HH:mm:ss".
 */
export function formatExcelCellValue(val) {
  if (val === null || val === undefined) return '';

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const hh = String(val.getHours()).padStart(2, '0');
    const mm = String(val.getMinutes()).padStart(2, '0');
    const ss = String(val.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  const valStr = String(val).trim();
  if (!valStr) return '';

  const num = Number(valStr);
  if (!isNaN(num) && num > 30000 && num < 80000 && valStr.includes('.')) {
    try {
      // Excel serial date formula: (serial - 25569) * 86400 * 1000 = Unix timestamp ms
      const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(dateObj.getTime())) {
        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getUTCDate()).padStart(2, '0');
        const hh = String(dateObj.getUTCHours()).padStart(2, '0');
        const mm = String(dateObj.getUTCMinutes()).padStart(2, '0');
        const ss = String(dateObj.getUTCSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
      }
    } catch (e) {
      // fallback
    }
  }

  return valStr;
}
