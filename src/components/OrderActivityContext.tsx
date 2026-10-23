import { createContext } from 'react'
import type { CohortFinancials } from '../core/analytics/orderLifecycle'
export const OrderActivityContext = createContext<CohortFinancials['orders']>([])
