const base = 'http://localhost:5000';

async function getJson(res) {
  try {
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

const name = `E2E Test Product ${Date.now()}`;
console.log('Creating product:', name);
let res = await fetch(`${base}/products`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, current_stock: 10, cost_price: 5, selling_price: 15 }),
});
let json = await getJson(res);
console.log('create product status', res.status, json.success, json.message || json.error);
if (!json.success) process.exit(1);
const product = json.data?.product || json.data?.products?.[0];
if (!product) {
  console.error('No product returned', json);
  process.exit(1);
}
const productId = product.id;
console.log('productId', productId);

const getProduct = async () => {
  const p = await fetch(`${base}/products`);
  const pj = await getJson(p);
  return (pj.data?.products || []).find((item) => item.id === productId);
};

let prod = await getProduct();
console.log('initial stock:', prod?.current_stock);

console.log('Creating sale of 2 units');
res = await fetch(`${base}/sales`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ product_id: productId, quantity: 2, selling_price: 15 }),
});
json = await getJson(res);
console.log('sale status', res.status, json.success, json.message || json.error);
if (!json.success) process.exit(1);

prod = await getProduct();
console.log('after sale stock:', prod?.current_stock);

const dash = await fetch(`${base}/dashboard`);
const dashJson = await getJson(dash);
console.log('dashboard load ok:', dash.status, dashJson.success);
const tx = (dashJson.data?.transactions || []).find((item) => item.productName === name || item.description?.startsWith('Sale'));
if (!tx) {
  console.error('No sale transaction found in dashboard', dashJson.data?.transactions);
  process.exit(1);
}
console.log('sale tx found', tx.id, tx.type, tx.amount, tx.productName);

console.log('Refunding sale transaction id', tx.id);
res = await fetch(`${base}/activities/${tx.id}/refund`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'sale' }),
});
json = await getJson(res);
console.log('refund status', res.status, json.success, json.message || json.error);
if (!json.success) process.exit(1);

prod = await getProduct();
console.log('after refund stock:', prod?.current_stock);

const dash2 = await fetch(`${base}/dashboard`);
const dashJson2 = await getJson(dash2);
const tx2 = (dashJson2.data?.transactions || []).find((item) => item.id === tx.id);
console.log('tx after refund', tx2?.type, tx2?.amount, tx2?.description);

console.log('Deleting refund transaction id', tx.id);
res = await fetch(`${base}/activities/${tx.id}`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'sale' }),
});
json = await getJson(res);
console.log('delete refund status', res.status, json.success, json.message || json.error);
if (!json.success) process.exit(1);

prod = await getProduct();
console.log('after deleting refund stock:', prod?.current_stock);

const dash3 = await fetch(`${base}/dashboard`);
const dashJson3 = await getJson(dash3);
const stillPresent = (dashJson3.data?.transactions || []).some((item) => item.id === tx.id);
console.log('tx still present after delete?', stillPresent);

console.log('Cleaning up product');
res = await fetch(`${base}/products/${productId}`, { method: 'DELETE' });
json = await getJson(res);
console.log('cleanup status', res.status, json.success, json.message || json.error);
