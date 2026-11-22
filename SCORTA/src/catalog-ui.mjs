export function contrastText(hex){
 const c=hex.slice(1).match(/../g)?.map(x=>parseInt(x,16)/255)||[0,0,0];
 const [r,g,b]=c.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return .2126*r+.7152*g+.0722*b>.179?'#000000':'#ffffff';
}
export const catalogMoney=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(value||0);
export const catalogUrl=company=>'/catalogo/'+encodeURIComponent(company.slug);
