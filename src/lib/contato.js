// E-mail da equipe Organiza+ para dúvidas, ajuda e pedidos sobre dados (LGPD).
export const EMAIL_CONTATO = 'joaoemanuel15@edu.unifor.br';

// Grupo de ajuda no WhatsApp. Só aparece dentro do sistema (quem já usa);
// nas páginas públicas o contato é o e-mail. O link não fica no repositório
// (que é público): vem da variável VITE_GRUPO_WHATSAPP, configurada só na
// Vercel. Sem ela, o botão do grupo não aparece. O link ainda chega ao
// navegador; quem barra estranhos é a aprovação de participantes no grupo.
export const GRUPO_WHATSAPP = import.meta.env.VITE_GRUPO_WHATSAPP ?? '';
