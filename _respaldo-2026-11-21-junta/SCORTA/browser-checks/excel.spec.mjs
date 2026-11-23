import {test,expect,login,navigate} from './fixtures.mjs';
import {excelBuffer} from '../src/excel.mjs';
import {purchaseColumns} from '../purchase-import.mjs';

const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function purchaseDialog(page){await navigate(page,'Compras');await page.getByRole('button',{name:'Ingresar mercancía',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Ingresar mercancía',exact:true});await dialog.getByText('CARGAR COMPRA DESDE EXCEL',{exact:true}).click();return dialog}
async function workbook(product,cost=20000){return Buffer.from(await excelBuffer({title:'COMPRA',columns:purchaseColumns,rows:[{producto_id:product.id,referencia:product.referencia,nombre:product.nombre,cantidad:2,precio_unitario:cost}]}))}

test('Excel: descarga plantilla, valida vista previa y registra la compra una sola vez',async({page,scenario})=>{
 await login(page,scenario.admin);const dialog=await purchaseDialog(page);
 const waiting=page.waitForEvent('download');await dialog.getByRole('button',{name:'DESCARGAR PLANTILLA EXCEL',exact:true}).click();expect((await waiting).suggestedFilename()).toMatch(/\.xlsx$/);
 await dialog.getByLabel('ARCHIVO EXCEL (.xlsx)',{exact:true}).setInputFiles({name:'compra-qa.xlsx',mimeType:mime,buffer:await workbook(scenario.product)});
 await expect(dialog.getByRole('heading',{name:/VISTA PREVIA/})).toBeVisible();expect((await scenario.data()).state.compras).toHaveLength(0);
 await dialog.getByRole('button',{name:'USAR PRODUCTOS DEL EXCEL',exact:true}).click();await dialog.getByRole('button',{name:'Registrar compra',exact:true}).click();await expect(dialog).not.toBeVisible();
 const data=await scenario.data();expect(data.state.compras).toHaveLength(1);expect(data.state.compras[0].total).toBe(40000);expect(data.state.prods.find(p=>p.id===scenario.product.id).stock).toBe(52);
});

test('Excel: costo whitespace y contadores ZIP alterados se rechazan sin modificar existencias',async({page,scenario})=>{
 await login(page,scenario.admin);const dialog=await purchaseDialog(page),file=dialog.getByLabel('ARCHIVO EXCEL (.xlsx)',{exact:true});
 await file.setInputFiles({name:'costo-vacio.xlsx',mimeType:mime,buffer:await workbook(scenario.product,'   ')});
 await expect(dialog.getByRole('alert')).toContainText(/costo/i);await expect(dialog.getByRole('button',{name:'USAR PRODUCTOS DEL EXCEL',exact:true})).toHaveCount(0);
 const bad=new Uint8Array(await workbook(scenario.product)),view=new DataView(bad.buffer,bad.byteOffset,bad.byteLength);let end=-1;
 for(let i=bad.length-22;i>=Math.max(0,bad.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break}
 expect(end).toBeGreaterThanOrEqual(0);view.setUint16(end+8,0,true);view.setUint16(end+10,0,true);
 await file.setInputFiles({name:'estructura-alterada.xlsx',mimeType:mime,buffer:Buffer.from(bad)});
 await expect(dialog.getByRole('alert')).toContainText(/estructura|archivo|válido|elementos|ZIP/i);
 const data=await scenario.data();expect(data.state.compras).toHaveLength(0);expect(data.state.prods.find(p=>p.id===scenario.product.id).stock).toBe(50);
});
