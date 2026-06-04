const res = await fetch('https://ai-gateway.vercel.sh/v1/models', { 
    headers: { 'Authorization': 'Bearer ' + process.env.VERCEL_AI_GATEWAY_API_KEY } 
}); 
const data = await res.json(); 
console.log(JSON.stringify(data.data?.map(m => m.id).filter(id => id.includes('moonshot') || id.includes('kimi')), null, 2));
