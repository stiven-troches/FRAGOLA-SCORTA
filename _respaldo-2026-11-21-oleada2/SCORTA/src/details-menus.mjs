// Menús desplegables hechos con <details>: se cierran con Escape y con un clic fuera.
// Solo afecta a menús (no a paneles informativos como datos del cliente o historial).
export const MENU_SELECTOR='details.cw-options,details.cw-filter,details[data-menu]';
let installed=false;
export function installDetailsMenus(root=globalThis.document){
 if(installed||!root?.addEventListener)return ()=>{};
 installed=true;
 const openMenus=()=>[...root.querySelectorAll(MENU_SELECTOR)].filter(menu=>menu.open);
 const keydown=event=>{
  if(event.key!=='Escape')return;
  const menus=openMenus();if(!menus.length)return;
  // Escape closes the menu first; the dialog underneath stays open.
  event.preventDefault();event.stopPropagation();
  for(const menu of menus)menu.open=false;
  menus.at(-1).querySelector('summary')?.focus?.();
 };
 const pointer=event=>{for(const menu of openMenus())if(!menu.contains(event.target))menu.open=false};
 root.addEventListener('keydown',keydown,true);
 root.addEventListener('pointerdown',pointer,true);
 return ()=>{installed=false;root.removeEventListener('keydown',keydown,true);root.removeEventListener('pointerdown',pointer,true)};
}
