// BE-38: helper de pruebas para el motor de inventario (inventory.mjs) sin el antiguo
// servidor «motoshop». Aplica cada cambio sobre una copia (todo o nada) y repite la
// respuesta de un requestId ya confirmado, como lo hace la plataforma.
import {createHash} from 'node:crypto';
import {aplicarCambio, estadoVacio} from '../inventory.mjs';

export function memoryStore() {
  let state = estadoVacio();
  const requests = new Map();
  return {
    read: () => structuredClone(state),
    change(action, actor = 'local') {
      const fingerprint = createHash('sha256').update(JSON.stringify({kind: action.kind, form: action.form, items: action.items, id: action.id})).digest('hex');
      if (action.requestId && requests.has(action.requestId)) {
        if (requests.get(action.requestId) !== fingerprint) throw Error('El identificador de operación ya fue usado con otros datos');
        return structuredClone(state);
      }
      const next = aplicarCambio(structuredClone(state), action, actor);
      if (action.requestId) requests.set(action.requestId, fingerprint);
      state = next;
      return structuredClone(state);
    },
    close() {},
  };
}
