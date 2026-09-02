const BASE_ID = 'appp9KaXdhwJ3H85L';
const BOOKINGS_TABLE = 'tblXP5bZB9nCbIYfP';
const BLOCKED_TABLE = 'tblixvX34OWlZcb38';
export const CAPACITY = 8;

export const schedule = {
  1:['13:00','15:00','17:00'],
  2:['13:00','15:00','17:00'],
  3:['13:00','15:00','17:00'],
  4:['13:00','15:00','17:00'],
  5:['13:00','15:00','17:00'],
  6:['11:00','13:00','15:00','17:00']
};

function token(){
  if(!process.env.AIRTABLE_TOKEN) throw new Error('AIRTABLE_TOKEN fehlt');
  return process.env.AIRTABLE_TOKEN;
}

export function localDay(dateStr){
  const [y,m,d]=dateStr.split('-').map(Number);
  return new Date(y,m-1,d).getDay();
}

async function airtableList(tableId, params={}){
  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const r = await fetch(url,{headers:{Authorization:`Bearer ${token()}`}});
  if(!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
  return await r.json();
}

export async function listAll(tableId, filterByFormula){
  let out=[], offset;
  do{
    const params = {pageSize:'100'};
    if(filterByFormula) params.filterByFormula = filterByFormula;
    if(offset) params.offset = offset;
    const d = await airtableList(tableId,params);
    out.push(...(d
