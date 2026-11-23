// BE-37: límites por empresa según el plan contratado. Reglas puras compartidas por el servidor,
// la demo local y la interfaz (el panel del propietario y el espacio de la empresa).
//
// Decisiones (docs/PLATFORM-API.md › Límites por plan):
// - `company.plan = {maxUsers, maxProducts, maxPhotos, features:[...]}`. Un máximo `null` es
//   «sin límite». Una empresa sin plan (todas las existentes) queda sin límites y con todas las
//   funciones: compatibilidad total con los datos anteriores.
// - Los límites se revisan solo al CREAR (usuario activo, producto o foto nuevos): si una empresa
//   ya está por encima, conserva lo que tiene y no puede agregar más. Respuesta 403 PLAN_LIMIT.
// - Una función desactivada responde 403 PLAN_LIMIT al crear documentos nuevos de esa función;
//   los documentos ya existentes se pueden terminar (cobrar abonos, cerrar garantías, recibir
//   órdenes), para no dejar mercancía ni dinero a medio camino.
const fail=(message,status=400,code)=>{throw Object.assign(Error(message),{status,...(code?{code}:{})})};

export const PLAN_FEATURES=Object.freeze([
  ['credito','Ventas a crédito y cupos'],
  ['cotizaciones','Cotizaciones'],
  ['garantias','Garantías'],
  ['ordenes_compra','Órdenes de compra y cuentas por pagar'],
  ['iva','IVA en las ventas'],
]);
export const PLAN_FEATURE_KEYS=PLAN_FEATURES.map(([key])=>key);
const featureNames=Object.fromEntries(PLAN_FEATURES);
export const planFeatureLabel=key=>featureNames[key]||key;
export const PLAN_LIMIT_LABELS=Object.freeze({maxUsers:'usuarios activos',maxProducts:'productos',maxPhotos:'fotos de productos'});
export const DEFAULT_PLAN=Object.freeze({maxUsers:null,maxProducts:null,maxPhotos:null,features:Object.freeze([...PLAN_FEATURE_KEYS])});
const MAX_LIMIT=1000000;

const limitValue=value=>value==null||value===''||!Number.isSafeInteger(Number(value))||Number(value)<0?null:Number(value);
/** Plan vigente de una empresa con valores por defecto (sin límites, todas las funciones). */
export function companyPlan(company){
  const raw=company?.plan;
  if(!raw||typeof raw!=='object')return {...DEFAULT_PLAN,features:[...DEFAULT_PLAN.features]};
  const features=Array.isArray(raw.features)?PLAN_FEATURE_KEYS.filter(key=>raw.features.includes(key)):[...PLAN_FEATURE_KEYS];
  return {maxUsers:limitValue(raw.maxUsers),maxProducts:limitValue(raw.maxProducts),maxPhotos:limitValue(raw.maxPhotos),features};
}
/** Valida el formulario del propietario. Vacío o null = sin límite. */
export function cleanPlan(form={}){
  if(!form||typeof form!=='object'||Array.isArray(form))fail('Plan inválido.');
  const limit=(key,label)=>{
    const value=form[key];if(value==null||value==='')return null;
    const number=Number(value);
    if(!Number.isSafeInteger(number)||number<0||number>MAX_LIMIT)fail(`${label}: usa un número entero entre 0 y ${MAX_LIMIT}, o déjalo vacío para no limitar.`);
    return number;
  };
  const features=form.features==null?[...PLAN_FEATURE_KEYS]:form.features;
  if(!Array.isArray(features)||features.some(key=>!PLAN_FEATURE_KEYS.includes(key)))fail('Funciones del plan inválidas. Usa: '+PLAN_FEATURE_KEYS.join(', ')+'.');
  return {maxUsers:limit('maxUsers','Máximo de usuarios'),maxProducts:limit('maxProducts','Máximo de productos'),maxPhotos:limit('maxPhotos','Máximo de fotos'),features:PLAN_FEATURE_KEYS.filter(key=>features.includes(key))};
}
export const planAllows=(company,feature)=>companyPlan(company).features.includes(feature);
/** 403 PLAN_LIMIT si la función no está incluida en el plan de la empresa. */
export function assertFeature(company,feature){
  if(!company||planAllows(company,feature))return;
  fail(`Tu plan no incluye ${planFeatureLabel(feature).toLowerCase()}. Pide al propietario de SCORTA que active esta función.`,403,'PLAN_LIMIT');
}
/**
 * 403 PLAN_LIMIT cuando la operación deja la empresa por encima del límite y además aumenta
 * la cantidad (una empresa que ya estaba por encima conserva lo que tiene).
 */
export function assertLimit(company,key,next,previous=0){
  const max=companyPlan(company)[key];
  if(max==null||next<=max||next<=previous)return;
  const label=max===1?{maxUsers:'usuario activo',maxProducts:'producto',maxPhotos:'foto de producto'}[key]:PLAN_LIMIT_LABELS[key];
  fail(`El plan de la empresa permite hasta ${max} ${label}. Para agregar más, hay que ampliar el plan con el propietario de SCORTA.`,403,'PLAN_LIMIT');
}
export const photoCount=prods=>(Array.isArray(prods)?prods:[]).filter(product=>product?.foto).length;
/** Uso actual frente al plan: {users, products, photos} con límite y si está lleno. */
export function planUsage(company,{users=0,products=0,photos=0}={}){
  const plan=companyPlan(company),row=(used,max)=>({used,max,full:max!=null&&used>=max});
  return {users:row(users,plan.maxUsers),products:row(products,plan.maxProducts),photos:row(photos,plan.maxPhotos)};
}
