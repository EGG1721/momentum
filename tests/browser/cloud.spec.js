import { test,expect } from '@playwright/test';
test.skip(!process.env.VITE_SUPABASE_URL,'Requires a build configured with the mock Supabase URL.');
const uid='11111111-1111-4111-8111-111111111111';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'agenda@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
function backend() {
  let row=null;
  return {get row(){return row;},async attach(context){
    await context.route('https://momentum-test.supabase.co/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      const fulfill=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
      if(url.pathname==='/auth/v1/token'){
        const payload=Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');
        return fulfill({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.fake`,refresh_token:'fake-refresh',expires_in:3600,token_type:'bearer',user});
      }
      if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
      if(url.pathname==='/auth/v1/user')return fulfill(user);
      if(url.pathname==='/rest/v1/momentum_members')return fulfill({user_id:uid});
      if(url.pathname==='/rest/v1/momentum_agendas') {
        if(request.method()==='GET')return fulfill(row);
        const next=request.postDataJSON();
        if(request.method()==='POST' && row)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'23505'})});
        if(request.method()==='PATCH' && Number(url.searchParams.get('revision')?.slice(3))!==row?.revision)return fulfill(null);
        row={...next};return fulfill({revision:row.revision});
      }
      throw new Error(`Unexpected Supabase request ${request.method()} ${url.pathname}`);
    });
  }};
}
async function login(page) {
  await page.goto('http://localhost:4183/');
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(user.email);
  await page.getByLabel('Contraseña',{exact:true}).fill('test-password-only');
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByText(user.email,{exact:true})).toBeVisible();
}
async function addHabit(page,name){
  await page.getByRole('button',{name:'+ Nuevo',exact:true}).click();
  await page.getByPlaceholder('Ej: Meditar 10 minutos').fill(name);
  await page.getByRole('button',{name:'✦ Crear Hábito',exact:true}).click();
}
test('login, cloud save, offline reload, reconnect, logout and second device',async({page,context,browser})=>{
  const api=backend(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await api.attach(context);await login(page);
  await addHabit(page,'Caminar en la nube');
  await expect.poll(()=>api.row?.data.habits.length).toBe(1);
  await expect(page.getByText('Sincronizado con Supabase',{exact:true})).toBeVisible();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await context.setOffline(true);await addHabit(page,'Leer sin conexión');await page.reload();
  await expect(page.getByText('Leer sin conexión',{exact:false})).toBeVisible();
  expect(api.row.data.habits).toHaveLength(1);
  await context.setOffline(false);
  await expect.poll(()=>api.row?.data.habits.length).toBe(2);
  const other=await browser.newContext();await api.attach(other);const second=await other.newPage();
  await login(second);await expect(second.getByText('Leer sin conexión',{exact:false})).toBeVisible();
  await other.close();
  page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await expect(page.getByRole('button',{name:'Iniciar sesión',exact:true})).toBeVisible();
  await expect(page.getByText('Leer sin conexión',{exact:false})).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('simultaneous offline edits show a conflict without overwriting cloud',async({page,context,browser})=>{
  const api=backend();await api.attach(context);await login(page);await addHabit(page,'Base');
  await expect.poll(()=>api.row?.data.habits.length).toBe(1);
  const other=await browser.newContext();await api.attach(other);const second=await other.newPage();await login(second);
  await expect(second.getByText('Base',{exact:false}).first()).toBeVisible();
  await expect(second.getByText('Sincronizado con Supabase',{exact:true})).toBeVisible();
  await context.setOffline(true);await other.setOffline(true);
  await addHabit(page,'Cambio teléfono');await addHabit(second,'Cambio computadora');
  await context.setOffline(false);await expect.poll(()=>api.row?.data.habits.some(h=>h.name==='Cambio teléfono')).toBe(true);
  await other.setOffline(false);
  await expect(second.getByText('Hay cambios diferentes en otro dispositivo',{exact:true})).toBeVisible();
  expect(api.row.data.habits.some(h=>h.name==='Cambio computadora')).toBe(false);
  await expect(second.getByText('Cambio computadora',{exact:false})).toBeVisible();
  await other.close();
});
