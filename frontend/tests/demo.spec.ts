import {test,expect} from '@playwright/test';
test('chapter discovery preserves real computation, provenance and replay',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1920,height:1080});await page.goto('/');
 await expect(page.getByRole('heading',{name:'Same evidence. Opposite conclusions.'})).toBeVisible();
 await page.screenshot({path:'../docs/redesign-question-1920.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Run investigation',exact:true}).click();
 const chapters=page.getByRole('navigation',{name:'Investigation stages'}).getByRole('button');
 await chapters.nth(4).click();const approve=page.getByRole('button',{name:'Approve & run experiment',exact:true});
 await expect(approve).toBeVisible({timeout:30000});await approve.click();
 await expect(page.getByRole('heading',{name:'The relationship reverses.',exact:true})).toBeVisible({timeout:60000});
 await expect(page.getByText('Actual result · n = 342')).toBeVisible();
 for(const width of [1920,1440]){
  await page.setViewportSize({width,height:width===1920?1080:900});
  for(let i=0;i<7;i++){
   await chapters.nth(i).click();await expect(page.locator('.chapter>section')).toHaveCount(1);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
   await page.screenshot({path:`../docs/redesign-${width}-chapter-${i+1}.png`,fullPage:true,animations:'disabled'});
  }
 }
 await expect(page.getByRole('heading',{name:'Test sex and year effects within species',exact:true})).toBeVisible();
 await chapters.nth(2).click();await page.getByRole('button',{name:'Color by species',exact:true}).click();
 await expect(page.getByRole('img',{name:'Actual bill measurements with species-specific fitted trends'})).toBeVisible();
 await page.getByRole('button',{name:/^Agents/}).click();await expect(page.getByRole('dialog',{name:'Agent activity'})).toBeVisible();
 await page.getByRole('button',{name:'Close agents'}).click();await expect(page.getByRole('dialog',{name:'Agent activity'})).toBeHidden();
 await page.getByRole('button',{name:'Research graph',exact:true}).click();
 await page.getByRole('button',{name:/^Inspect result /}).click();
 await expect(page.getByRole('dialog')).toContainText('dataset_sha256');await page.getByRole('button',{name:'Close provenance'}).click();
 await page.getByRole('button',{name:'Lab notebook',exact:true}).click();await expect(page.locator('.notebook-event').first()).toBeVisible();
 await expect(page.getByRole('link',{name:'Export JSON'})).toBeVisible();
 await page.getByRole('button',{name:'Replay verified run',exact:true}).click();await expect(page.getByText('REPLAY VERIFIED RUN',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Scientific workspace'}).click();await expect(page.getByRole('dialog',{name:'Investigations'})).toBeVisible();await page.keyboard.press('Escape');
 for(const width of [1024,768,390]){
  await page.setViewportSize({width,height:900});
  for(let i=0;i<7;i++){await chapters.nth(i).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
  await page.getByRole('button',{name:'Research graph',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }
 expect(errors).toEqual([]);
});
