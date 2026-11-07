// Como o negócio atende: só balcão, só mesa ou os dois. Respondido pelo dono
// nas perguntas de boas-vindas e mudado depois em Minha conta.

export const MODOS = [
  {
    id: 'balcao',
    rotulo: 'Balcão',
    titulo: 'O cliente pede, paga e espera ficar pronto',
    passos: [
      'O cliente chega e faz o pedido.',
      'Ele paga na hora.',
      'O Organiza+ mostra um número para você dizer a ele.',
      'Quando fica pronto, você chama esse número e ele vem buscar.',
    ],
    exemplo: 'pastelaria, tapioca, açaí, trailer de lanche',
  },
  {
    id: 'mesa',
    rotulo: 'Mesa',
    titulo: 'O cliente senta, vai pedindo e paga tudo no final',
    passos: [
      'O cliente senta numa mesa.',
      'Ele pede aos poucos, quantas vezes quiser.',
      'O Organiza+ vai somando tudo na conta daquela mesa.',
      'Quando ele vai embora, você vê o total e recebe de uma vez.',
    ],
    exemplo: 'espetinho, bar, churrasquinho',
  },
  {
    id: 'balcao_e_mesa',
    rotulo: 'Balcão e mesa',
    titulo: 'Tenho os dois tipos de cliente',
    passos: [
      'Uns pedem, pagam e esperam o número.',
      'Outros sentam na mesa e pagam no final.',
      'A cada pedido, você toca em Balcão ou em Mesa.',
    ],
    exemplo: 'hamburgueria que também tem algumas mesas',
  },
];

const IDS = new Set(MODOS.map((m) => m.id));

// Sem resposta (ou banco antigo): os dois jeitos, como era antes.
export function modoDoNegocio(perfil) {
  return IDS.has(perfil?.modo_atendimento) ? perfil.modo_atendimento : 'balcao_e_mesa';
}

// Só o dono responde. null quer dizer "ainda não respondeu"; undefined é
// banco sem a coluna, e aí não dá para salvar a resposta.
export function precisaResponderBoasVindas(perfil) {
  return perfil?.papel === 'admin' && (perfil.modo_atendimento === null || precisaResponderMesas(perfil));
}

// Já respondeu como atende, atende na mesa e ainda não disse quantas mesas tem
// (conta de antes do mapa das mesas): responde só essas perguntas.
// undefined é banco sem a migração das mesas: não pergunta.
export function precisaResponderMesas(perfil) {
  return (
    perfil?.papel === 'admin' &&
    IDS.has(perfil.modo_atendimento) &&
    atendeNaMesa(perfil.modo_atendimento) &&
    (perfil.quantidade_mesas === null || perfil.taxa_servico === null)
  );
}

// Mapa das mesas em Pedidos: atende na mesa e já disse quantas mesas tem.
// Sem isso (atendente antes do dono responder, banco sem a migração), o
// pedido de mesa é pelo número digitado, como antes.
export function usaMapaDeMesas(perfil) {
  return atendeNaMesa(modoDoNegocio(perfil)) && Number.isInteger(perfil?.quantidade_mesas) && perfil.quantidade_mesas >= 1;
}

// Taxa de serviço em % (0: não cobra).
export function taxaDoNegocio(perfil) {
  return usaMapaDeMesas(perfil) && Number.isInteger(perfil.taxa_servico) ? perfil.taxa_servico : 0;
}

export function atendeNoBalcao(modo) {
  return modo !== 'mesa';
}

export function atendeNaMesa(modo) {
  return modo !== 'balcao';
}

// Destino com que um pedido novo começa.
export function destinoInicial(modo) {
  return { tipo: modo === 'mesa' ? 'mesa' : 'balcao', mesa: '' };
}
