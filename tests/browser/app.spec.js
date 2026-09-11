import {test,expect} from '@playwright/test';
test('mobile agenda, persistence, backup, offline and navigation',async({page,context})=>{
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto('/');
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  await page.getByRole('button',{name:'+ Nuevo',exact:true}).click();
  await page.getByPlaceholder('Ej: Meditar 10 minutos').fill('Caminar cada día');
  await page.getByRole('button',{name:'✦ Crear Hábito',exact:true}).click();
  await expect(page.getByText('Caminar cada día',{exact:false})).toBeVisible();
  await page.reload();
  await expect(page.getByText('Caminar cada día',{exact:false})).toBeVisible();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar respaldo'}).click();
  const backup=await downloaded;
  const backupPath=await backup.path();
  page.on('dialog',d=>d.accept());
  await page.locator('input[type=file]').setInputFiles(backupPath);
  await expect(page.getByText('Respaldo restaurado correctamente.')).toBeVisible();
  for(const name of ['Mi Día','Hábitos','Tareas','Enfoque','Historial','Hoy']){
    await page.getByRole('navigation').getByRole('button',{name,exact:false}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Caminar cada día',{exact:false})).toBeVisible();
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('selected-date blocks, early hours, invalid import and mobile history',async({page})=>{
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button',{name:'Mi Día'}).click();
  await page.getByRole('button',{name:'✦ Nuevo Bloque',exact:true}).click();
  await page.getByPlaceholder('Ej: Levantar pesas, Leer, Desayunar...').fill('Cita de madrugada');
  await page.locator('input[type=time]').nth(0).fill('01:00');
  await page.locator('input[type=time]').nth(1).fill('02:00');
  await page.getByRole('dialog').locator('select').nth(1).selectOption('once');
  await page.getByRole('button',{name:'✦ Agregar Bloque'}).click();
  await expect(page.getByText('Cita de madrugada').last()).toBeVisible();
  await page.getByRole('button',{name:'Día siguiente'}).click();
  await expect(page.getByText('Cita de madrugada')).toHaveCount(0);
  await page.getByRole('button',{name:'Día anterior'}).click();
  await expect(page.getByText('Cita de madrugada').last()).toBeVisible();
  const before=await page.evaluate(()=>localStorage.getItem('momentum_v4'));
  await page.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"tasks":[null]}')});
  await expect(page.getByRole('status')).toContainText('No se restauró');
  expect(await page.evaluate(()=>localStorage.getItem('momentum_v4'))).toBe(before);
  await page.setViewportSize({width:320,height:740});
  for(const name of ['Mi Día','Hábitos','Tareas','Enfoque','Historial','Hoy']) {
    await page.getByRole('navigation').getByRole('button',{name,exact:false}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
test('corrupted storage is preserved and writes blocked',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>localStorage.setItem('momentum_v4','{broken'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('No se pudo leer');
  await page.getByRole('button',{name:'+ Nuevo',exact:true}).click();
  await page.getByPlaceholder('Ej: Meditar 10 minutos').fill('Should not overwrite');
  await page.getByRole('button',{name:'✦ Crear Hábito',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('momentum_v4'))).toBe('{broken');
});
test('focus completes exactly once after clock jumps and duration is locked',async({page})=>{
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button',{name:'Enfoque'}).click();
  await page.getByRole('button',{name:'▶ Iniciar'}).click();
  await expect(page.getByRole('button',{name:'25 min',exact:true})).toBeDisabled();
  await page.clock.fastForward(25*60*1000+1000);
  await expect(page.getByText('🎉 ¡Sesión completada! Tómate un descanso.')).toBeVisible();
  const sessions=await page.evaluate(()=>JSON.parse(localStorage.getItem('momentum_v4')).sessions);
  expect(sessions).toHaveLength(1); expect(sessions[0].mins).toBe(25);
});
