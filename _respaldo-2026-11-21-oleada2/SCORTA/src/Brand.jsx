import React from 'react';
import './brand.css';

// Only the owner's original artwork may be placed here. Never redraw the mark.
// Vite keeps the supplied file intact and only fingerprints its deployed filename.
const supplied=import.meta.glob('./assets/fragola-scorta-logo.{png,jpg,jpeg,webp,svg}',{eager:true,query:'?url',import:'default'});
export const officialBrandAsset=Object.values(supplied)[0]||null;
const variants=import.meta.glob('./assets/fragola-scorta-logo-{160,320,480}.{png,webp}',{eager:true,query:'?url',import:'default'});
const variant=(width,format)=>variants[`./assets/fragola-scorta-logo-${width}.${format}`];
const srcset=format=>[160,320,480].filter(width=>variant(width,format)).map(width=>`${variant(width,format)} ${width}w`).join(', ');
const hasVariants=[160,320,480].every(width=>variant(width,'png')&&variant(width,'webp'));
// FE-16: WebP con pérdida para el tamaño mostrado (160 px ≈ 22 KB, 320 px para pantallas 2x).
// Los WebP sin pérdida verificados siguen como respaldo para 480 px.
const web=import.meta.glob('./assets/fragola-scorta-logo-{160,320}-web.webp',{eager:true,query:'?url',import:'default'});
const webSrcset=()=>{const light=[160,320].filter(width=>web[`./assets/fragola-scorta-logo-${width}-web.webp`]).map(width=>`${web[`./assets/fragola-scorta-logo-${width}-web.webp`]} ${width}w`);return light.length===2?[...light,`${variant(480,'webp')} 480w`].join(', '):srcset('webp')};
export default function Brand({className='',compact=false}){
 const sizes=className.split(' ').includes('ow-brand')?'64px':compact?'70px':'154px';
 return <span className={`scorta-brand ${compact?'scorta-brand-compact':''} ${className}`}>
  {officialBrandAsset?(hasVariants?<picture>
   <source type="image/webp" srcSet={webSrcset()} sizes={sizes}/>
   <img src={variant(320,'png')} srcSet={srcset('png')} sizes={sizes} width="1122" height="1402" decoding="async" alt="FRAGOLA SCORTA" className="scorta-brand-original"/>
  </picture>:<img src={officialBrandAsset} alt="FRAGOLA SCORTA" className="scorta-brand-original"/>):<span className="scorta-app-name">SCORTA</span>}
 </span>;
}
