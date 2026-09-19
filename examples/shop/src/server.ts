// Local deterministic shop with six deliberate faults and session-local order data.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export async function startShop(port = 0) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname === '/health') {
      response.writeHead(200).end('ok')
      return
    }
    if (url.pathname === '/broken-payment') {
      response.writeHead(500).end('Payment service unavailable')
      return
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>JevTest fixture shop</title><style>
      body{font:18px system-ui;background:#edf3f0;color:#153329;max-width:700px;margin:70px auto;padding:32px}main{background:white;padding:36px;border-radius:16px}button{padding:12px 20px;background:#175d47;color:white;border:0;border-radius:8px;font:inherit;cursor:pointer}small{letter-spacing:2px;color:#537666}h1{font-size:38px}pre{background:#edf3f0;padding:18px}strong{font-size:26px}
      </style></head><body><small>JEVTEST / CONTROLLED FIXTURE</small><h1>The little supply shop</h1><main id="app"></main><script>
      const params = new URLSearchParams(location.search);
      const bug = params.get('bug') || 'none';
      const quantity = Number(params.get('quantity') || 1);
      const price = Number(params.get('price') || 20);
      const discount = Number(params.get('discount') || 0);
      let state = { stage: 'product', quantity, price, discount, cartCount: 0, displayedTotal: 0, orders: [], paymentError: false };
      window.shopState = () => JSON.parse(JSON.stringify(state));
      function render() {
        const app = document.getElementById('app');
        if(state.stage === 'product') app.innerHTML = '<h2>Field notebook</h2><p>Quantity: '+quantity+' · Unit price: £'+price+'</p><p>Discount: '+discount+'%</p><button id="add">Add to cart</button>';
        if(state.stage === 'cart') app.innerHTML = '<h2>Your cart</h2><p>Items: '+state.cartCount+'</p><p>Total: <strong>£'+state.displayedTotal.toFixed(2)+'</strong></p>'+(bug === 'missing-checkout' ? '' : '<button id="checkout">Go to checkout</button>');
        if(state.stage === 'checkout') app.innerHTML = '<h2>Review your order</h2><p>Pay exactly £'+state.displayedTotal.toFixed(2)+'</p><button id="place">Place one order</button>';
        if(state.stage === 'confirmation') app.innerHTML = '<h2>Order confirmed</h2><p>Orders created: '+state.orders.length+'</p><p>Charged: £'+state.orders.reduce((sum,o)=>sum+o.total,0).toFixed(2)+'</p>';
        if(state.stage === 'error') app.innerHTML = '<h2>Payment failed</h2><p role="alert">Payment service unavailable. No order was created.</p>';
        document.getElementById('add')?.addEventListener('click',()=>{ state.cartCount = bug === 'cart-count' ? quantity+1 : quantity; state.displayedTotal = quantity*price*(1-discount/100); state.stage='cart'; render(); });
        document.getElementById('checkout')?.addEventListener('click',()=>{state.stage='checkout';render();});
        document.getElementById('place')?.addEventListener('click',async()=>{
          if(bug==='payment-error'){document.getElementById('place').disabled=true;await fetch('/broken-payment');console.error('Payment service unavailable');state.paymentError=true;state.stage='error';render();return;}
          const total = bug==='wrong-total' ? state.displayedTotal+5 : bug==='discount' ? quantity*price : state.displayedTotal;
          const order = { quantity: bug==='wrong-quantity' ? quantity+1 : quantity, total };
          state.orders.push(order); if(bug==='duplicate')state.orders.push({...order});
          state.stage='confirmation';render();
        });
      }
      render();
    </script></body></html>`)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  }
}
