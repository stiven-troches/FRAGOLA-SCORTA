// Support conversations are private platform data, independent of stock and drafts.
const fail=(message,status=400,code='INVALID_TICKET')=>{throw Object.assign(Error(message),{status,code})};
const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label}: escribe entre 1 y ${max} caracteres.`);return value.trim()};
const roles=new Set(['admin','vendedor']);
const MAX_OPEN_TICKETS=50;
const statuses={open:'Abierto',in_progress:'En atención',resolved:'Resuelto'};
const canSee=(ticket,actor)=>actor.role==='owner'||actor.companyId===ticket.companyId&&(actor.role==='admin'||actor.role==='vendedor'&&ticket.createdBy===actor.id);
const count=ticket=>1+(ticket.messages?.length||0);
function findTicket(state,actor,id){
  const ticket=(state.supportTickets||[]).find(item=>item.id===id);
  // Do not distinguish another company's ticket from a missing identifier.
  if(!ticket||!canSee(ticket,actor))fail('El ticket no existe o no está disponible.',404,'TICKET_NOT_FOUND');
  return ticket;
}
function markRead(ticket,actor){ticket.readers??={};ticket.readers[actor.id]=count(ticket)}
function addMessage(ticket,actor,message,now,{finalResolution=false}={}){
  ticket.messages??=[];
  // Keep all existing history and reserve exactly one extra event to resolve a
  // full conversation. It cannot be used for replies or repeated status toggles.
  const closingFull=finalResolution&&ticket.messages.length===500;
  if(ticket.messages.length>=500&&!closingFull)fail('Este ticket alcanzó el límite de mensajes. Si sigue abierto, el propietario puede resolverlo. Para continuar la conversación se necesita otro ticket.');
  ticket.messages.push({id:crypto.randomUUID(),userId:actor.id,name:actor.name||actor.username,role:actor.role,message,createdAt:now,...(closingFull?{kind:'final_resolution'}:{})});
  ticket.updatedAt=now;
  markRead(ticket,actor);
}

export function visibleTickets(state,actor){
  return (state.supportTickets||[]).filter(ticket=>canSee(ticket,actor)).map(ticket=>({
    id:ticket.id,companyId:ticket.companyId,createdBy:ticket.createdBy,creatorName:ticket.creatorName,
    title:ticket.title,description:ticket.description,status:ticket.status,createdAt:ticket.createdAt,updatedAt:ticket.updatedAt,
    messages:structuredClone(ticket.messages||[]),unreadCount:Math.max(0,count(ticket)-(ticket.readers?.[actor.id]||0))
  }));
}

export function applyTicketAction(state,actor,action,now){
  const form=action.form||{};
  if(action.type==='ticket.create'){
    if(!actor.companyId||!roles.has(actor.role))fail('Solo los usuarios de la empresa pueden crear un ticket.',403,'FORBIDDEN');
    // Bound the shared platform state: a company keeps at most 50 unresolved tickets.
    if((state.supportTickets||[]).filter(item=>item.companyId===actor.companyId&&item.status!=='resolved').length>=MAX_OPEN_TICKETS)fail(`Tu empresa tiene ${MAX_OPEN_TICKETS} tickets sin resolver. Espera a que el propietario resuelva alguno antes de crear otro.`,429,'TICKET_LIMIT');
    const ticket={id:crypto.randomUUID(),companyId:actor.companyId,createdBy:actor.id,creatorName:actor.name||actor.username,
      title:text(form.title,'Asunto',160),description:text(form.description,'Descripción',5000),status:'open',
      createdAt:now,updatedAt:now,messages:[],readers:{[actor.id]:1}};
    state.supportTickets??=[];state.supportTickets.unshift(ticket);return ticket;
  }
  const ticket=findTicket(state,actor,action.id);
  if(action.type==='ticket.reply'){
    const message=text(form.message,'Respuesta',5000);
    addMessage(ticket,actor,message,now);
    if(actor.role==='owner')ticket.status='in_progress';
    else if(ticket.status==='resolved')ticket.status='open';
  }else if(action.type==='ticket.status'){
    if(actor.role!=='owner')fail('Solo el propietario puede cambiar el estado del ticket.',403,'FORBIDDEN');
    if(!Object.hasOwn(statuses,form.status))fail('Selecciona Abierto, En atención o Resuelto.');
    if(ticket.status!==form.status){
      addMessage(ticket,actor,`Estado del ticket: ${statuses[form.status]}.`,now,{finalResolution:form.status==='resolved'});
      ticket.status=form.status;
    }
  }else if(action.type==='ticket.read')markRead(ticket,actor);
  else fail('Acción de soporte desconocida.',404,'NOT_FOUND');
  return ticket;
}
