export type AppPage = 'Home' | 'Products' | 'Returns' | 'Advertising' | 'Costs' | 'Reports' | 'Data & Settings' | 'Tools'
export const appNavigation: readonly { page: AppPage; label: string; description: string; icon: string; group: 'Analytics' | 'Workspace'; }[] = [
  { page:'Home', label:'Dashboard', description:'Business overview', icon:'◫', group:'Analytics' },
  { page:'Products', label:'Products', description:'Product performance', icon:'▦', group:'Analytics' },
  { page:'Advertising', label:'Advertising', description:'Spend and attribution', icon:'↗', group:'Analytics' },
  { page:'Returns', label:'Returns', description:'Returns and recovery', icon:'↩', group:'Analytics' },
  { page:'Costs', label:'Product costs', description:'Unit costs and history', icon:'₹', group:'Workspace' },
  { page:'Reports', label:'Reports', description:'Import and source evidence', icon:'⇧', group:'Workspace' },
  { page:'Tools', label:'Tools', description:'PDF labels and seller utilities', icon:'✂', group:'Workspace' },
  { page:'Data & Settings', label:'Settings', description:'Preferences and backup', icon:'⚙', group:'Workspace' },
]
