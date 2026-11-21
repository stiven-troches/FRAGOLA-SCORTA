// SEG-01: RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s) on WebCrypto only, so the same
// code runs in Node and in the browser-local demo without dependencies.
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',STEP_MS=30000,DIGITS=6;
export function base32Encode(bytes){let bits=0,value=0,out='';for(const byte of bytes){value=value<<8|byte;bits+=8;while(bits>=5){out+=ALPHABET[value>>>bits-5&31];bits-=5;}}if(bits>0)out+=ALPHABET[value<<5-bits&31];return out;}
export function base32Decode(text){
  const clean=String(text||'').toUpperCase().replace(/[\s=-]/g,'');let bits=0,value=0;const out=[];
  for(const char of clean){const index=ALPHABET.indexOf(char);if(index<0)throw Error('Secreto TOTP inválido');value=value<<5|index;bits+=5;if(bits>=8){out.push(value>>>bits-8&255);bits-=8;}}
  return Uint8Array.from(out);
}
export const generateTotpSecret=()=>base32Encode(crypto.getRandomValues(new Uint8Array(20)));
export async function totpCode(secret,counter){
  const key=await crypto.subtle.importKey('raw',base32Decode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const message=new Uint8Array(8);let rest=BigInt(counter);for(let i=7;i>=0;i--){message[i]=Number(rest&255n);rest>>=8n;}
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,message)),offset=digest[19]&15;
  const binary=(digest[offset]&127)<<24|digest[offset+1]<<16|digest[offset+2]<<8|digest[offset+3];
  return String(binary%10**DIGITS).padStart(DIGITS,'0');
}
export const totpCounter=nowMs=>Math.floor(nowMs/STEP_MS);
/** Returns the matching counter (window ±1) or null. Callers reject counters <= the last used one (no replay). */
export async function verifyTotp(secret,code,nowMs,{window=1,after=-1}={}){
  if(typeof code!=='string'||!/^\d{6}$/.test(code.trim())||!secret)return null;
  const value=code.trim(),current=totpCounter(nowMs);let match=null;
  for(let delta=-window;delta<=window;delta++){const counter=current+delta;if(counter<=after)continue;const expected=await totpCode(secret,counter);let diff=0;for(let i=0;i<DIGITS;i++)diff|=expected.charCodeAt(i)^value.charCodeAt(i);if(diff===0&&match===null)match=counter;}
  return match;
}
export const otpauthUri=(secret,account,issuer='SCORTA')=>'otpauth://totp/'+encodeURIComponent(issuer)+':'+encodeURIComponent(account)+'?secret='+secret+'&issuer='+encodeURIComponent(issuer)+'&algorithm=SHA1&digits=6&period=30';
