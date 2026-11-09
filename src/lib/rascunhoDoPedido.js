const chave = id => 'organiza-rascunho-pedido:'+id;
export function lerRascunho(id) {
  try {
    const salvo=JSON.parse(localStorage.getItem(chave(id)));
    if (Array.isArray(salvo)) return {itens:salvo,chaveEnvio:null};
    return {itens:Array.isArray(salvo?.itens)?salvo.itens:[],chaveEnvio:salvo?.chaveEnvio ?? null};
  } catch { return {itens:[],chaveEnvio:null}; }
}
export function gravarRascunho(id,itens,chaveEnvio) {
  try {
    if (itens.length || chaveEnvio) localStorage.setItem(chave(id),JSON.stringify({itens,chaveEnvio}));
    else localStorage.removeItem(chave(id));
  } catch { /* sem armazenamento: mantém o pedido nesta tela */ }
}
