import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {PullToRefresh} from '../../src/components/PullToRefresh'
function Harness(){const [count,setCount]=useState(0),[busy,setBusy]=useState(false);let finish=()=>{};const [resolve,setResolve]=useState<()=>void>(()=>finish);return <><PullToRefresh enabled onRefresh={()=>{setCount(n=>n+1);setBusy(true);return new Promise<void>(done=>setResolve(()=>()=>{setBusy(false);done()}))}}/><p data-testid="refresh-count">{count}</p><button onClick={resolve}>Finish request</button><div style={{height:2400}}>Scroll test</div></>}
createRoot(document.getElementById('root')!).render(<Harness/> )
