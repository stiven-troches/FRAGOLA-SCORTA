// Decimal half-up at a shared two-decimal boundary, without binary tie drift.
function cents(value){
 const number=Number(value);if(!Number.isFinite(number))throw Error('Importe no válido.');
 const match=String(number).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
 const fraction=match[3]||'',scale=fraction.length-Number(match[4]||0),digits=BigInt(match[2]+fraction);
 let result;if(scale<=2)result=digits*10n**BigInt(2-scale);else{const divisor=10n**BigInt(scale-2);result=digits/divisor+(digits%divisor*2n>=divisor?1n:0n)}
 return match[1]?-result:result;
}
export const roundMoney=value=>Number(cents(value))/100;
export const sumMoney=values=>Number(values.reduce((total,value)=>total+cents(value),0n))/100;
export function moneyAmount(value,label='Importe'){
 if(value==null||!['number','string'].includes(typeof value)||String(value).trim()==='')throw Error(label+': importe inválido; indica un valor.');
 const number=Number(value);
 if(!Number.isFinite(number)||number<0||number>1e12||roundMoney(number)!==number)throw Error(label+': importe inválido; usa un valor no negativo de hasta dos decimales.');
 return number;
}
