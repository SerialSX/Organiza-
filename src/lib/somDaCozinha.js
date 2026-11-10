// Qual som tocar quando a fila da Cozinha muda (decisão da validação de campo).
// - Fila vazia e chega pedido: som forte ("novo"), o cozinheiro pode estar
//   distraído.
// - Já tem pedido na tela e chega mais: um "tic" curto e baixo, no máximo um a
//   cada 30 segundos (a faixa "+N pedidos novos" diz quantos chegaram).
// - Pedido alterado ou cancelado: dois bipes ("aviso"), sem limite: muda o que
//   a cozinha está fazendo.
// - Vários pedidos chegando juntos tocam um som só (a decisão é por mudança
//   da lista, não por pedido).
// - O "Pronto" que o próprio cozinheiro toca não faz som.
export const INTERVALO_DO_TIC_MS = 30_000;

// chegouNovo: chegou pedido novo nesta mudança. filaAntes: quantos pedidos
// havia na fila antes dela. outraNovidade: pedido alterado ou cancelado.
// ultimoTic: quando tocou o último tic, em ms (o som forte não conta: um
// pedido logo depois dele ainda ganha o seu tic).
export function somDaMudanca({ chegouNovo, filaAntes, outraNovidade, ultimoTic, agora }) {
  if (chegouNovo && filaAntes === 0) return 'novo';
  if (outraNovidade) return 'aviso';
  if (!chegouNovo) return null;
  if (ultimoTic != null && agora - ultimoTic < INTERVALO_DO_TIC_MS) return null;
  return 'tic';
}

// Modo foco: a cozinha escolhe ver 1, 2 ou 3 pedidos por vez (cartões grandes).
// 0 = todos (o padrão).
export const OPCOES_DE_FOCO = [0, 1, 2, 3];

export function lerFoco(valor) {
  const n = Number(valor);
  return OPCOES_DE_FOCO.includes(n) ? n : 0;
}

// Divide a fila no modo foco: os primeiros aparecem, o resto vira "+N na fila"
// (e quantos desse resto chegaram agora e ainda não foram vistos).
export function dividirFila(fila, foco, naoVistos = new Set()) {
  if (!foco) return { mostrados: fila, escondidos: 0, novosEscondidos: 0 };
  const resto = fila.slice(foco);
  return {
    mostrados: fila.slice(0, foco),
    escondidos: resto.length,
    novosEscondidos: resto.filter((p) => naoVistos.has(p.id)).length,
  };
}
