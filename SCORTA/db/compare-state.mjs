// DM-12: compara dos estados de plataforma (el original y el exportado desde Postgres) y lista
// cada diferencia con su ruta. «Sin pérdida» significa que no se pierde ningún dato; la
// comparación solo pasa por alto lo que el JSON no distingue:
//   - claves con valor null/undefined (el JSON del app a veces escribe `customerId: null`);
//   - colecciones y objetos vacíos (`[]`, `{}`), que equivalen a no tenerlos;
//   - los valores que el app omite cuando valen su neutro: `devuelto: 0`, `anulada: false`,
//     `afterClosure: false`, `alerted: false`, `mustChangePassword: false` (el esquema los guarda como columna con valor por defecto).
// Todo lo demás (cadenas vacías incluidas) debe ser idéntico.

const NEUTRAL = new Set(['devuelto', 'anulada', 'afterClosure', 'alerted', 'mustChangePassword']);

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child === null || child === undefined) continue;
      if (NEUTRAL.has(key) && (child === 0 || child === false)) continue;
      const clean = canonical(child);
      if (Array.isArray(clean) && !clean.length) continue;
      if (clean && typeof clean === 'object' && !Array.isArray(clean) && !Object.keys(clean).length) continue;
      out[key] = clean;
    }
    return out;
  }
  return value;
}

/** Lista de diferencias {path, expected, actual} entre dos estados (ya canónicos). */
export function diffStates(expected, actual, limit = 200) {
  const diffs = [];
  const walk = (a, b, path) => {
    if (diffs.length >= limit) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) diffs.push({path: path + '.length', expected: a.length, actual: b.length});
      for (let index = 0; index < Math.min(a.length, b.length); index++) walk(a[index], b[index], `${path}[${index}]`);
    } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], `${path}.${key}`);
    } else if (a !== b) diffs.push({path, expected: a, actual: b});
  };
  walk(canonical(expected), canonical(actual), '$');
  return diffs;
}
