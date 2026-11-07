import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Botao from '../ui/Botao';
import Aviso from '../ui/Aviso';
import { enviarTesteParaCozinha } from '../../services/testeCozinha';

const PASSOS = [
  ['Pegue o celular ou tablet que vai ficar na cozinha.', 'Pode ser um aparelho antigo. Ele só precisa abrir a internet.'],
  ['Ligue a internet nele.', 'Wi-Fi ou dados. Os dois aparelhos, este e o da cozinha, precisam estar com internet.'],
  ['Abra o Organiza+ nele.', 'Aponte a câmera do aparelho da cozinha para o código abaixo.'],
  ['Entre com o mesmo e-mail e a mesma senha desta conta.', null],
  ['Toque em "Cozinha", no menu.', null],
  ['Toque uma vez na tela da Cozinha.', 'O celular só deixa o som de pedido novo tocar depois desse toque.'],
  ['Deixe o aparelho na tomada, com a tela acesa e só com o Organiza+ aberto.', 'Se a tela apagar ou outro app ficar por cima, os pedidos não aparecem e o som não toca.'],
];

// Passo a passo para ligar o aparelho da cozinha. negocioId: com ele aparece
// o "Testar agora" (manda um aviso de teste, sem criar pedido).
// rotuloDepoisDoTeste: o botão de fechar muda de nome quando o teste deu certo.
export default function GuiaCozinha({ negocioId, rotuloFechar, rotuloDepoisDoTeste, onFechar }) {
  const endereco = `${window.location.origin}/login`;
  const [qr, setQr] = useState('');
  const [teste, setTeste] = useState(null); // null | 'enviando' | 'ok' | 'sem-resposta'

  useEffect(() => {
    let ativo = true;
    QRCode.toDataURL(endereco, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => ativo && setQr(url))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [endereco]);

  async function testar() {
    setTeste('enviando');
    const chegou = await enviarTesteParaCozinha(negocioId);
    setTeste(chegou ? 'ok' : 'sem-resposta');
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[var(--text-secondary)]">
        Os pedidos que você lançar aqui aparecem <strong className="text-[var(--text-primary)]">na hora</strong> no aparelho da
        cozinha. Faça assim:
      </p>

      <ol className="flex flex-col gap-3">
        {PASSOS.map(([titulo, texto], i) => (
          <li key={titulo} className="flex gap-3">
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-full font-bold tabular-nums text-[var(--sobre-destaque)]"
              style={{ backgroundColor: 'var(--color-accent-cozinha)' }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex flex-col gap-1">
              <p className="font-semibold text-[var(--text-primary)]">{titulo}</p>
              {texto && <p className="text-sm text-[var(--text-secondary)]">{texto}</p>}
              {i === 2 && (
                <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-3">
                  {qr && (
                    <img
                      src={qr}
                      alt="QR code que abre a tela de entrar do Organiza+"
                      width="160"
                      height="160"
                      className="w-40 h-40 rounded-xl bg-white p-2"
                    />
                  )}
                  <p className="text-sm text-[var(--text-secondary)]">
                    Não deu certo? Abra o navegador do aparelho da cozinha e digite:{' '}
                    <strong className="block break-all text-[var(--text-primary)]" translate="no">
                      {endereco.replace(/^https?:\/\//, '')}
                    </strong>
                  </p>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div aria-live="polite" className="empty:hidden">
        {teste === 'ok' && <Aviso tipo="sucesso">A cozinha recebeu o teste. Está tudo certo!</Aviso>}
        {teste === 'sem-resposta' && (
          <Aviso tipo="info">
            O teste não chegou. Confira se o aparelho da cozinha está com a tela Cozinha aberta e com internet, e tente de novo.
          </Aviso>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {negocioId && (
          <Botao cor="var(--color-accent-cozinha)" onClick={testar} disabled={teste === 'enviando'}>
            {teste === 'enviando' ? 'Esperando a cozinha…' : 'Fiz tudo, testar agora'}
          </Botao>
        )}
        {onFechar && (
          <Botao variante="secundaria" onClick={onFechar}>
            {teste === 'ok' && rotuloDepoisDoTeste ? rotuloDepoisDoTeste : rotuloFechar}
          </Botao>
        )}
      </div>
      {negocioId && (
        <p className="text-sm text-[var(--text-secondary)]">
          O teste não cria pedido: só aparece &quot;Teste recebido&quot; na cozinha e toca o som.
        </p>
      )}
    </div>
  );
}
