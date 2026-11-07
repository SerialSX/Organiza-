// Cardápios para começar sem digitar tudo. Os preços são de exemplo: a tela
// pede para conferir. vai_para_cozinha: false = bebida e o que sai pronto.
export const CARDAPIOS_PRONTOS = [
  {
    id: 'pastelaria',
    nome: 'Pastelaria',
    produtos: [
      { nome: 'Pastel de carne', preco: 9 },
      { nome: 'Pastel de queijo', preco: 8 },
      { nome: 'Pastel de frango', preco: 9 },
      { nome: 'Pastel misto', preco: 10 },
      { nome: 'Pastel de pizza', preco: 10 },
      { nome: 'Caldo de cana', preco: 6, vai_para_cozinha: false },
      { nome: 'Refrigerante lata', preco: 6, vai_para_cozinha: false },
    ],
  },
  {
    id: 'hamburgueria',
    nome: 'Hamburgueria',
    produtos: [
      { nome: 'X-Burguer', preco: 18 },
      { nome: 'X-Salada', preco: 20 },
      { nome: 'X-Bacon', preco: 23 },
      { nome: 'X-Tudo', preco: 28 },
      { nome: 'Batata frita', preco: 15 },
      { nome: 'Refrigerante lata', preco: 6, vai_para_cozinha: false },
      { nome: 'Suco natural', preco: 8 },
    ],
  },
  {
    id: 'espetaria',
    nome: 'Espetaria',
    produtos: [
      { nome: 'Espeto de carne', preco: 9 },
      { nome: 'Espeto de frango', preco: 8 },
      { nome: 'Espeto de linguiça', preco: 8 },
      { nome: 'Espeto de queijo coalho', preco: 8 },
      { nome: 'Baião de dois', preco: 12 },
      { nome: 'Refrigerante lata', preco: 6, vai_para_cozinha: false },
      { nome: 'Cerveja lata', preco: 7, vai_para_cozinha: false },
      { nome: 'Água mineral', preco: 3, vai_para_cozinha: false },
    ],
  },
  {
    id: 'bebidas',
    nome: 'Só bebidas',
    produtos: [
      { nome: 'Refrigerante lata', preco: 6, vai_para_cozinha: false },
      { nome: 'Refrigerante 2 litros', preco: 12, vai_para_cozinha: false },
      { nome: 'Água mineral', preco: 3, vai_para_cozinha: false },
      { nome: 'Cerveja lata', preco: 7, vai_para_cozinha: false },
      { nome: 'Suco de caixinha', preco: 5, vai_para_cozinha: false },
    ],
  },
];

// Não cadastra de novo o que já existe (mesmo nome, sem ligar para acento e
// maiúscula): tocar duas vezes não duplica o cardápio.
export function produtosQueFaltam(cardapio, existentes) {
  const chave = (nome) => nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const ja = new Set(existentes.map((p) => chave(p.nome)));
  return cardapio.produtos.filter((p) => !ja.has(chave(p.nome)));
}
