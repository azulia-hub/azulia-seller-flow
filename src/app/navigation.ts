export type AppPage = 'Home' | 'Products' | 'Returns' | 'Advertising' | 'Costs' | 'Reports' | 'Data & Settings'
export const appNavigation: readonly { page: AppPage; label: string; mobileLabel?: string; description: string; icon: string; group: 'Analytics' | 'Workspace'; bottom?: boolean }[] = [
  { page:'Home', label:'Dashboard', description:'Business overview', icon:'◫', group:'Analytics', bottom:true },
  { page:'Products', label:'Products', description:'Product performance', icon:'▦', group:'Analytics', bottom:true },
  { page:'Advertising', label:'Advertising', mobileLabel:'Ads', description:'Spend and attribution', icon:'↗', group:'Analytics', bottom:true },
  { page:'Returns', label:'Returns', description:'Returns and recovery', icon:'↩', group:'Analytics' },
  { page:'Costs', label:'Product costs', description:'Unit costs and history', icon:'₹', group:'Workspace' },
  { page:'Reports', label:'Reports', description:'Import and source evidence', icon:'⇧', group:'Workspace', bottom:true },
  { page:'Data & Settings', label:'Settings', description:'Preferences and backup', icon:'⚙', group:'Workspace', bottom:true },
]
