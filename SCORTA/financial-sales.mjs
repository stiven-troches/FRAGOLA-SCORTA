// Keep independent delivered legacy workshop income without counting sale mirrors twice.
export function financialSales(business={}){
 const sales=Array.isArray(business.ventas)?business.ventas:[];
 const legacy=(Array.isArray(business.servs)?business.servs:[]).filter(service=>!service.venta_id&&!service.saleId&&!service.documento&&(service.estado==='entregado'||service.anulada&&service.estado_anterior==='entregado'));
 return [...sales,...legacy.map(service=>({...service,id:'legacy-service:'+service.id,fecha:service.fecha_entrega||service.fecha,
  legacyService:true,labor:Array.isArray(service.labor)&&service.labor.length?service.labor:[{descripcion:service.descripcion_trabajo||'Servicio histórico',mecanico:service.mecanico||'Sin identificar',importe:service.costo_mano_obra??service.subtotal_mano_obra??0}],
  paymentMethod:service.paymentMethod||service.medio_pago||'',cliente:service.cliente||'Cliente general'}))];
}
