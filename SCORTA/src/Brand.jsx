import React from 'react';
import './brand.css';

// Only the owner's original artwork may be placed here. Never redraw the mark.
// Vite keeps the supplied file intact and only fingerprints its deployed filename.
const supplied=import.meta.glob('./assets/fragola-scorta-logo.{png,jpg,jpeg,webp,svg}',{eager:true,query:'?url',import:'default'});
export const officialBrandAsset=Object.values(supplied)[0]||null;
export default function Brand({className='',compact=false}){
 return <span className={`scorta-brand ${compact?'scorta-brand-compact':''} ${className}`}>
  {officialBrandAsset?<img src={officialBrandAsset} alt="FRAGOLA SCORTA" className="scorta-brand-original"/>:<span className="scorta-app-name">SCORTA</span>}
 </span>;
}
