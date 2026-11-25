export async function draftRequest(method='GET',body,companyId){
  let response;
  const headers={...(body?{'Content-Type':'application/json'}:{}),...(companyId?{'X-SCORTA-Company':companyId}:{})};
  try{response=await fetch('/api/v2/draft',{method,credentials:'same-origin',headers,...(body?{body:JSON.stringify(body),keepalive:new TextEncoder().encode(JSON.stringify(body)).length<60000}:{})})}
  catch{throw Error('No se pudo guardar la venta pendiente. Revisa la conexión y reintenta antes de cerrar.')}
  // A proxy or the platform can answer with HTML (502/503). Treat it as a temporary failure.
  let value;
  try{value=await response.json()}
  catch{throw Object.assign(Error(method==='GET'?'No se pudo recuperar la venta pendiente: el servidor no respondió correctamente. Reintenta en unos segundos.':'No se pudo confirmar el guardado de la venta pendiente. Reintenta en unos segundos.'),{status:response.status>=400?response.status:502})}
  if(!response.ok)throw Object.assign(Error(value?.error||'No se pudo recuperar la venta pendiente.'),{status:response.status,code:value?.code});
  return value;
}

// Serializes saves, keeps the same write ID after an uncertain response, and never
// overwrites a draft that another tab/device has changed.
export class SaleDraftSync{
  constructor({request=draftRequest,onStatus=()=>{},onChange=()=>{},onSaved=()=>{}}={}){this.request=request;this.onStatus=onStatus;this.onChange=onChange;this.onSaved=onSaved;this.version=0;this.saved='null';this.latest=null;this.loaded=false;this.disposed=false;this.flight=null;this.attempt=null;this.conflict=false;this.timer=null;this.status='loading';this.online=true}
  report(status,error=''){this.status=status;if(!this.disposed)this.onStatus({status,error})}
  async load(){this.report('loading');try{const value=await this.request();this.version=value.version;this.latest=value.draft;this.saved=JSON.stringify(value.draft);this.attempt=null;this.conflict=false;this.loaded=true;this.report('saved');return value}catch(e){this.report('error',e.message);throw e}}
  update(draft){if(!this.loaded||this.disposed)return;this.latest=structuredClone(draft);clearTimeout(this.timer);if(JSON.stringify(this.latest)===this.saved){/* FE-14: volver al estado guardado antes del envío (p. ej. «Deshacer» rápido) no deja «Guardando…» colgado. */if(this.status==='saving'&&!this.flight&&!this.attempt&&!this.conflict)this.report('saved');return}if(this.conflict)return;try{this.onChange()}catch{}if(!this.online){this.report('offline');return}this.report('saving');this.timer=setTimeout(()=>this.flush().catch(()=>{}),400)}
  // Another tab announced a change: stop saving here and show the existing conflict notice.
  markConflict(message='Otra pestaña o equipo cambió esta venta. Carga la versión guardada para continuar.'){if(!this.loaded||this.disposed||this.conflict)return;clearTimeout(this.timer);this.conflict=true;this.report('conflict',message)}
  async flush(){
    clearTimeout(this.timer);
    if(this.disposed||!this.loaded)throw Error('Espera a recuperar tu venta pendiente.');
    if(this.conflict)throw Error('Recarga el borrador guardado para resolver el cambio de otra pestaña.');
    if(this.flight){await this.flight;return this.flush()}
    this.flight=(async()=>{
      while(this.attempt||JSON.stringify(this.latest)!==this.saved){
        this.report('saving');
        this.attempt??={version:this.version,draft:structuredClone(this.latest),writeId:crypto.randomUUID()};
        const sent=this.attempt;
        try{const value=await this.request('POST',sent);this.version=value.version;this.saved=JSON.stringify(sent.draft);this.attempt=null;try{this.onSaved(this.version)}catch{}}
        catch(e){
          this.conflict=e.code==='DRAFT_CONFLICT';
          // A validation rejection did not apply this write. Keep the latest edits,
          // but let their corrected payload use a fresh ID on the next save.
          if(e.status===400&&!this.conflict)this.attempt=null;
          this.report(this.conflict?'conflict':'error',e.message);throw e;
        }
      }
      this.report('saved');
    })();
    try{await this.flight}finally{this.flight=null}
  }
  // FE-18: offline the cart keeps changing locally; nothing is sent until the connection returns,
  // then the pending write goes out (same write ID if an earlier attempt was uncertain).
  setOnline(online){
    online=!!online;if(online===this.online)return;this.online=online;
    if(!this.loaded||this.disposed||this.conflict)return;
    if(!online){clearTimeout(this.timer);if(!this.flight)this.report('offline');return}
    if(this.unsaved)this.flush().catch(()=>{});else this.report('saved');
  }
  acceptCompleted(value){clearTimeout(this.timer);this.version=value.version;this.latest=null;this.saved='null';this.attempt=null;this.conflict=false;this.report('saved');try{this.onSaved(this.version)}catch{}}
  get unsaved(){return !!this.attempt||JSON.stringify(this.latest)!==this.saved}
  dispose(){this.disposed=true;clearTimeout(this.timer)}
}
