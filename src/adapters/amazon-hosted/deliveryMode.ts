import { androidDevice } from '../device/bridge'
export const hostedDelivery = androidDevice || import.meta.env.VITE_AZULIA_DELIVERY === 'netlify'
