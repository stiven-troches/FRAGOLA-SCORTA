import {aplicarCambio, estadoVacio} from '../inventory.mjs';

export const DEMO_PRODUCT_COUNT = 24;
const date = offset => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));

// All quantities, contacts and operations are fictitious. Each seed uses the real inventory engine.
export function crearSemillaDemo() {
  let state = estadoVacio();
  const rows = [
    ['Casco integral negro mate','CAS-001','Ruta','Cascos',20,4,120000,180000,'Integral M','Uso urbano'],
    ['Casco abatible gris','CAS-002','Ruta','Cascos',8,3,190000,285000,'Abatible L','Uso urbano'],
    ['Casco abierto blanco','CAS-003','Vía','Cascos',6,2,85000,135000,'Abierto M','Uso urbano'],
    ['Visor transparente universal','VIS-001','Vía','Cascos',2,3,24000,42000,'Transparente','Verificar anclajes'],
    ['Guantes urbanos negros','GUA-001','Moto Sur','Protección',12,3,38000,65000,'Talla M','Uso urbano'],
    ['Guantes impermeables','GUA-002','Moto Sur','Protección',7,2,58000,92000,'Talla L','Uso bajo lluvia'],
    ['Rodilleras articuladas','PRO-001','Ruta','Protección',5,2,70000,115000,'Par','Ajustables'],
    ['Impermeable dos piezas','IMP-001','Vía','Protección',10,3,42000,72000,'Talla L','Uso urbano'],
    ['Aceite 10W-40 1 litro','ACE-001','Motor Uno','Lubricantes',24,6,24000,38000,'10W-40','Revisar manual de la moto'],
    ['Aceite 20W-50 1 litro','ACE-002','Motor Uno','Lubricantes',18,5,19000,30000,'20W-50','Revisar manual de la moto'],
    ['Lubricante de cadena 400 ml','LUB-001','Motor Uno','Lubricantes',11,3,21000,36000,'Aerosol','Cadenas de moto'],
    ['Líquido de frenos DOT 4','FRE-001','Motor Uno','Lubricantes',8,2,14000,24000,'250 ml','Sistema compatible DOT 4'],
    ['Bombillo halógeno H4','BOM-001','Luz Moto','Iluminación',15,4,6500,12000,'H4 12 V','Revisar conector'],
    ['Kit luz LED H4','LED-001','Luz Moto','Iluminación',9,3,48000,85000,'H4 12 V','Revisar espacio y conector'],
    ['Direccionales LED ámbar','DIR-001','Luz Moto','Iluminación',6,2,25000,45000,'Par 12 V','Puede requerir adaptador'],
    ['Espejos universales negros','ESP-001','Moto Sur','Accesorios',10,3,28000,48000,'Par rosca 10 mm','Revisar rosca'],
    ['Espejos tipo deportivo','ESP-002','Moto Sur','Accesorios',0,2,35000,59000,'Par','Revisar anclajes'],
    ['Soporte de celular para manubrio','SOP-001','Vía','Accesorios',14,4,18000,35000,'Ajustable','Manubrio compatible'],
    ['Cargador USB impermeable','USB-001','Luz Moto','Accesorios',7,2,17000,32000,'12 V a USB','Instalación por personal capacitado'],
    ['Candado de disco con alarma','SEG-001','Ruta','Seguridad',8,2,48000,82000,'Con alarma','Revisar orificio del disco'],
    ['Cadena de seguridad 1 metro','SEG-002','Ruta','Seguridad',1,2,38000,65000,'1 metro','Uso general'],
    ['Funda impermeable para moto','FUN-001','Vía','Accesorios',9,3,30000,52000,'Talla L','Revisar medidas de la moto'],
    ['Pastillas de freno delanteras','REP-001','Motor Uno','Repuestos',12,4,18000,34000,'Juego','Confirmar referencia de la moto'],
    ['Filtro de aire de ejemplo','REP-002','Motor Uno','Repuestos',0,2,16000,29000,'Elemento filtrante','Referencia de demostración'],
  ];
  // BE-36: ejemplo de listas de precios para mecánicos y mayoristas.
  const special = {'ACE-001':{mecanico:34000,mayorista:31000},'ACE-002':{mecanico:27000,mayorista:25000},'REP-001':{mecanico:30000,mayorista:27500},'BOM-001':{mecanico:10500,mayorista:9500},'LUB-001':{mecanico:32000}};
  for (const [index,[nombre,referencia,marca,categoria,stock,stock_minimo,precio_compra,precio_venta,modelo,compatibilidad]] of rows.entries()) {
    state = aplicarCambio(state, {kind:'producto',revision:state.revision,form:{nombre,referencia,marca,categoria,stock,stock_minimo,precio_compra,precio_venta,modelo,compatibilidad,codigo_barras:String(7700000000000+index+1),...(special[referencia]?{precios:special[referencia]}:{})}}, 'Demo');
  }
  const line=(reference,cantidad,precio_unitario)=>({producto_id:state.prods.find(p=>p.referencia===reference).id,cantidad,precio_unitario});
  const send=(kind,form,items=[],extra={})=>{state=aplicarCambio(state,{kind,form,items,revision:state.revision,...extra},'Demo');};
  send('compra',{fecha:date(-2),proveedor:'Distribuidor ficticio Norte'},[line('CAS-001',5,120000),line('ACE-001',8,24000)]);
  send('compra',{fecha:date(-1),proveedor:'Distribuidor ficticio Sur'},[line('GUA-001',4,38000),line('SOP-001',5,18000)]);
  send('venta',{fecha:date(0),cliente:'Cliente de ejemplo 1'},[line('CAS-001',2,180000),line('GUA-001',1,65000)]);
  send('venta',{fecha:date(0),cliente:'Cliente de ejemplo 2'},[line('ACE-001',3,38000),line('BOM-001',2,12000)]);
  send('servicio',{fecha:date(0),placa:'DEMO01',marca_moto:'Moto de demostración',descripcion_trabajo:'Cambio de bombillo de ejemplo',costo_mano_obra:25000},[line('BOM-001',1,12000)]);
  send('servicio',{fecha:date(0),placa:'DEMO02',marca_moto:'Moto de demostración',descripcion_trabajo:'Instalación de luz LED de ejemplo',costo_mano_obra:35000},[line('LED-001',1,85000)]);
  send('estado',{},[],{id:state.servs[0].id});
  // FE-06: las ventas de ejemplo registran su medio de pago para que el cierre de caja de la demo concilie.
  for (const [index,sale] of state.ventas.entries()) sale.paymentMethod ??= ['efectivo','tarjeta'][index%2];
  return state;
}
