// Small progressive browser client: preserve form edits, use revision checks, and surface server validation.
export const clientScript = `
window.benchmarkBusy=false;
document.addEventListener('submit',event=>{event.preventDefault();if(!window.benchmarkBusy)event.target.querySelector('button[type=submit]')?.click()});
document.addEventListener('click',async event=>{
 const button=event.target.closest('button[data-action]');
 if(!button||window.benchmarkBusy)return;
 event.preventDefault();
 window.benchmarkBusy=true;
 const form=document.getElementById('command-form');
 const values=Object.fromEntries(new FormData(form));
 button.disabled=true;
 try {
  const response=await fetch('/api/commands',{
   method:'POST',headers:{'Content-Type':'application/json','If-Match':String(window.benchmarkRevision),'Idempotency-Key':crypto.randomUUID()},
   body:JSON.stringify({action:button.dataset.action,values})
  });
  const result=await response.json();
  if(result.view){
   window.benchmarkView=result.view;window.benchmarkRevision=result.revision;
   document.getElementById('app').innerHTML=result.html;
  }
  if(result.error)document.querySelector('[role=status]').textContent=result.error;
  if(response.status>=500)console.error(result.error||'Server error');
 } catch(error){document.querySelector('[role=status]').textContent='Connection failed. Reload to check whether your change was saved.';console.error(error.message)}
 finally {window.benchmarkBusy=false;button.disabled=false}
});`
export const appStyles = `
*{box-sizing:border-box}body{margin:0;background:#f3f5f8;color:#182839;font:15px/1.5 system-ui,sans-serif}header{background:#172b3e;color:white;padding:22px max(24px,calc((100vw - 1120px)/2))}header a{color:#bde5ec}header h1{margin:0;font-size:24px}main{max-width:1120px;margin:28px auto;padding:0 24px 50px}h2{font-size:18px;margin:0 0 16px}section{background:white;border:1px solid #d9e1e7;border-radius:12px;padding:24px;margin:20px 0}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.stats article{background:white;border:1px solid #d9e1e7;border-radius:12px;padding:20px}.stats span{display:block;color:#526574}.stats strong{font-size:26px}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}label{display:block;font-weight:600}input,select{display:block;width:100%;padding:11px;border:1px solid #9cabb8;border-radius:6px;margin-top:6px;background:white;color:inherit;font:inherit}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}button{border:1px solid transparent;border-radius:6px;background:#125968;color:white;padding:11px 18px;font:600 14px system-ui;cursor:pointer}button.secondary{background:#eef3f5;color:#243d49;border-color:#c8d3da}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #36a6bf;outline-offset:2px}button:disabled{opacity:.6}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th{color:#526574;font-size:12px;text-transform:uppercase;letter-spacing:.05em}td,th{padding:12px 14px;border-bottom:1px solid #e4eaee}tbody tr:last-child td{border:0}.empty{color:#657786}.review{display:flex;flex-wrap:wrap;gap:24px}.review dt{color:#526574}.review dd{margin:4px 0;font-weight:600}[role=status]:empty{display:none}.identity{color:#526574}@media(max-width:640px){.stats{grid-template-columns:1fr}.fields{grid-template-columns:1fr}section{padding:18px}header{padding:18px 24px}}
`
