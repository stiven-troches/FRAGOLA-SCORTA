# Subencargados de SCORTA

Actualizado: 21 de noviembre de 2026 · Versión 1 (borrador para publicar)

SCORTA trata los datos de los almacenes y de sus clientes **como encargado** (el almacén es el responsable). Para prestar el servicio usa los proveedores de esta lista. Cada uno trata solo lo necesario para su función.

> **Para el abogado (US-17):** varios proveedores están en **EE. UU.** u otros países. Hay que validar el régimen de **transferencia o transmisión internacional** de datos (Ley 1581 de 2012 y normas de la SIC): si basta con el contrato de transmisión, si EE. UU. se considera país con nivel adecuado según la SIC y qué cláusulas incluir. **Confirmar con abogado.**

> **Antes de publicar:** confirma el país y la entidad contratante de cada proveedor en sus términos vigentes (marcados «verificar»). Avisa a los almacenes con anticipación cuando agregues o cambies un subencargado (plazo según el contrato).

| Proveedor | País donde trata los datos | Finalidad | Datos que trata | Estado |
|---|---|---|---|---|
| **Render** (Render Services, Inc.) | **EE. UU.** (región elegida: Ohio o Virginia, US-06) | Alojamiento del servidor y la base de datos | **Todos** los datos del servicio: empresas, usuarios, inventario, ventas, clientes finales (nombre, teléfono, placa), auditoría. También registros técnicos (IP, fecha, ruta). | En uso |
| **Cloudflare** (Cloudflare, Inc.) | EE. UU. (sede); el tráfico pasa por su red global, incluido el centro de datos más cercano al usuario | DNS, proxy, certificado HTTPS y protección contra ataques | Todo el tráfico entre el navegador y el servidor pasa cifrado por Cloudflare, que lo descifra y vuelve a cifrar para filtrarlo. IP y datos técnicos del navegador. | Cuando haya dominio propio (US-14) |
| **Almacenamiento de respaldos**: Cloudflare R2 (opción principal) o Backblaze B2 (alternativa) | R2: según la ubicación elegida del bucket (verificar; sugerido Norteamérica). B2: EE. UU. o UE según la región de la cuenta | Guardar copias de seguridad | Copia completa de la base, **cifrada antes de salir del servidor** con una llave que el proveedor no tiene. El proveedor no puede leer el contenido. | En uso cuando se active el respaldo (OPS-01) |
| **Healthchecks.io** | Unión Europea (verificar) | Aviso de que el respaldo se hizo | Solo una señal de «éxito» o «fallo» y la IP del servidor. **Ningún dato de clientes.** | En uso (OPS-03) |
| **UptimeRobot** | Unión Europea / EE. UU. (verificar) | Vigilar que el servicio esté en línea | Solo consulta la página técnica `/healthz`. **Ningún dato de clientes.** | En uso (OPS-04) |
| **GitHub** (GitHub, Inc., Microsoft) | EE. UU. | Guardar el código fuente y ejecutar pruebas automáticas | **Solo código.** No recibe datos de almacenes ni de clientes. Las pruebas usan datos ficticios. | En uso |
| **Proveedor de correo** (por definir) | Por definir | Enviar correos de recuperación de contraseña y avisos | Nombre y correo del usuario, contenido del aviso | Futuro (SEG-13) |

## Lo que SCORTA **no** hace

- No vende ni comparte datos con terceros para publicidad.
- No usa los datos de clientes finales para fines propios.
- Los mensajes de WhatsApp los envía el almacén desde su propio teléfono; SCORTA solo abre el enlace. WhatsApp (Meta) no recibe datos desde el servidor de SCORTA.

## Historial de cambios

| Fecha | Cambio |
|---|---|
| 2026-11-21 | Primera versión |
