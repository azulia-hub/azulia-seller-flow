import { build } from 'vite'
await build({configFile:false,logLevel:'warn',build:{ssr:'src/adapters/amazon-report-sync/calculateReading.ts',outDir:'.local/engine',emptyOutDir:true,target:'node24',rollupOptions:{output:{entryFileNames:'engine.mjs'}}}})
console.log('Desktop background calculation engine built.')
