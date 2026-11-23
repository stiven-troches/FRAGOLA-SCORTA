// BE-37: SSR del editor de plan del propietario y de la interfaz que oculta lo desactivado.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compileSSR} from './ssr-build.mjs';

let ui,cleanup;
before(async()=>{({module:ui,cleanup}=await compileSSR('plan-ui',{PlanSummary:'src/OwnerWorkspace.jsx#PlanSummary',AdminTools:'src/AdminTools.jsx',MobileMoreMenu:'src/ClientWorkspace.jsx#MobileMoreMenu'}))});
after(()=>cleanup?.());

test('resumen del plan en el panel del propietario: uso frente a límites y funciones',()=>{
 const html=renderToStaticMarkup(React.createElement(ui.PlanSummary,{company:{plan:{maxUsers:3,maxProducts:null,maxPhotos:20,features:['credito','iva']},usage:{users:2,products:150,photos:4}},onEdit(){}}));
 for(const text of ['Plan y límites','Editar plan','2 de 3','150 · sin límite','4 de 20','Ventas a crédito y cupos · IVA en las ventas'])assert.ok(html.includes(text),text);
 const legacy=renderToStaticMarkup(React.createElement(ui.PlanSummary,{company:{usage:{users:1}}}));
 assert.match(legacy,/1 · sin límite/);assert.match(legacy,/Cotizaciones/);assert.doesNotMatch(legacy,/Editar plan/);
});

test('la interfaz oculta las funciones desactivadas: IVA, garantías y menú móvil',()=>{
 const settings=features=>renderToStaticMarkup(React.createElement(ui.AdminTools,{view:'settings',session:{role:'admin',companyId:'c1',company:{id:'c1',plan:{features}}},data:{state:{}},onAction:async()=>({}),onClose(){}}));
 assert.match(settings(['iva','cotizaciones']),/Cobrar y desglosar IVA/);assert.match(settings(['iva','cotizaciones']),/VIGENCIA DE LAS COTIZACIONES/);
 const without=settings([]);assert.match(without,/Tu plan no incluye IVA/);assert.doesNotMatch(without,/Cobrar y desglosar IVA/);assert.doesNotMatch(without,/VIGENCIA DE LAS COTIZACIONES/);
 const menu=features=>renderToStaticMarkup(React.createElement(ui.MobileMoreMenu,{admin:true,features,onNavigate(){},onProfile(){},onLogout(){}}));
 assert.match(menu(['cotizaciones','garantias']),/Cotizaciones[\s\S]*Garantías[\s\S]*Proveedores/);
 assert.doesNotMatch(menu([]),/Cotizaciones|Garantías/);
});
