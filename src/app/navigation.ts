export type AppPage = 'Home' | 'Products' | 'Returns' | 'Advertising' | 'Reports' | 'Data & Settings'

export const appNavigation: readonly { page: AppPage; label: string; mobileLabel?: string; description: string; icon: string }[] = [
  { page: 'Home', label: 'Dashboard', description: 'Business overview', icon: '⌂' },
  { page: 'Reports', label: 'Reports', description: 'Upload and compare', icon: '⇧' },
  { page: 'Data & Settings', label: 'Data & Settings', mobileLabel: 'Settings', description: 'Costs and preferences', icon: '⚙' },
]
