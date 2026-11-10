// Limpa a lista que o Gemini devolveu. Sem Deno aqui: o Vitest testa este
// arquivo em Node (validar.test.ts).
export type Item = { nome: string; preco: number | null };

// Controle e invisíveis (zero-width, marcas bidi) que uma foto pode fazer a IA copiar.
const INVISIVEIS = /[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g;

export function validarItens(bruto: unknown): Item[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const itens: Item[] = [];
  for (const candidato of bruto.slice(0, 100)) {
    const nome =
      typeof candidato?.nome === 'string'
        ? // = + - @ no começo viram fórmula quando o relatório abre no Excel.
          candidato.nome.replace(INVISIVEIS, '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@\s]+/, '')
        : '';
    if (!nome || nome.length > 120 || vistos.has(nome.toLowerCase())) continue;
    vistos.add(nome.toLowerCase());
    const preco = candidato.preco;
    // Sem preço válido vira null: a pessoa digita na conferência.
    itens.push({ nome, preco: typeof preco === 'number' && preco > 0 && preco <= 9999.99 ? Math.round(preco * 100) / 100 : null });
  }
  return itens;
}
