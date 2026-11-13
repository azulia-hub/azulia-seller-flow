import {test,expect} from '@playwright/test'
const csv=`date/time,settlement id,type,order id,sku,description,quantity,Transaction Status,product sales,selling fees,total
1 Nov 2026 10:00:00 UTC,TEST,Order,ORDER-A,SKU-A,Oak shelf,1,Deferred,100,-10,90
`
for(const width of [1280,390])test(`snapshot earnings and persistent preferences at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900})
  await page.route('**/api/report-sync/status',r=>r.fulfill({json:{configured:false,connectionKey:'test',revision:0,records:0,missingWindows:0,coverage:[],state:'idle',lastSync:null,nextAttempt:null,error:null}}))
  await page.goto('/')
  await page.getByRole('button',{name:'Upload report',exact:true}).first().click()
  await page.locator('input[type=file]').first().setInputFiles({name:'snapshot.csv',mimeType:'text/csv',buffer:Buffer.from(csv)})
  const navigate=async(name:string)=>{const menu=page.getByRole('button',{name:'Open navigation',exact:true});if(await menu.isVisible())await menu.click();await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name,exact:true}).click()}
  await navigate('Dashboard')
  // Restored period cards have Sales (Total) and Profit, with no Net Sale figure
  await expect(page.locator('.pulse-card').first()).toContainText('Sales (Total)')
  await expect(page.locator('.pulse-card').first()).toContainText('Profit')
  await expect(page.locator('.pulse-card').first()).not.toContainText('Net earnings')

  // Clicking a period card opens the orders popup modal
  await page.locator('.pulse-card').first().click()
  const modal = page.locator('.pulse-orders-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText('ORDER-A')
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()

  // Business snapshot has "Net sale (Net Amazon Payout)" for the selected date range
  const netSaleCard = page.locator('.kpi-card', { hasText: 'Net sale (Net Amazon Payout)' })
  await expect(netSaleCard).toBeVisible()
  // Gross (100) - refunds (0) - fees (10) = 90
  await expect(netSaleCard).toContainText('₹90')

  await navigate('Settings')
  await page.getByLabel('Check Amazon every').selectOption('5')
  await page.getByLabel('Money precision').selectOption('2')
  await page.getByLabel('Theme',{exact:true}).selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await navigate('Dashboard')
  await expect(netSaleCard).toContainText('₹90.00')
  await page.reload();await navigate('Settings')
  await expect(page.getByLabel('Check Amazon every')).toHaveValue('5')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('pull refresh fires only at the top and coalesces an active request',async({page})=>{
  await page.goto('/tests/fixtures/pullHarness.html')
  const gesture=async(down:boolean)=>page.evaluate(down=>{const target=document.body;const fire=(type:string,y:number)=>{const touch=new Touch({identifier:1,target,clientX:100,clientY:y});target.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}))};fire('touchstart',down?100:260);fire('touchmove',down?260:100);fire('touchend',down?260:100)},down)
  await gesture(false);await expect(page.getByTestId('refresh-count')).toHaveText('0')
  await gesture(true);await expect(page.getByTestId('refresh-count')).toHaveText('1')
  await gesture(true);await expect(page.getByTestId('refresh-count')).toHaveText('1')
  await page.getByRole('button',{name:'Finish request'}).click()
  await page.evaluate(()=>scrollTo(0,200));await gesture(true);await expect(page.getByTestId('refresh-count')).toHaveText('1')
  await page.evaluate(()=>scrollTo(0,0));await page.keyboard.press('Alt+r');await expect(page.getByTestId('refresh-count')).toHaveText('2')
})
