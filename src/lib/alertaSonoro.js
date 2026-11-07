// Som da Cozinha, gerado na hora com a Web Audio API (sem arquivo de áudio).
// O navegador só libera som depois de um toque na página: liberarAudio() é
// chamado no primeiro toque, e o mesmo contexto serve para todos os avisos.
let contexto = null;

export function audioSuportado() {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
}

export async function liberarAudio() {
  if (!audioSuportado()) return false;
  contexto ??= new (window.AudioContext || window.webkitAudioContext)();
  if (contexto.state !== 'running') {
    try {
      await contexto.resume();
    } catch {
      return false;
    }
  }
  return contexto.state === 'running';
}

// novo: "plim" de três notas subindo (lá, dó#, mi), duas vezes, para ser
// ouvido com chapa e exaustor ligados. aviso (pedido alterado ou cancelado):
// dois bipes curtos. pronto: duas notas agudas (mi, lá), confirmando o toque
// no "Pronto".
const SONS = {
  novo: { notas: [880, 1108.73, 1318.51], repeticoes: 2 },
  aviso: { notas: [880, 880], repeticoes: 1 },
  pronto: { notas: [1318.51, 1760], repeticoes: 1 },
};

function vibrar(padrao) {
  try {
    navigator.vibrate?.(padrao);
  } catch {
    // aparelho sem vibração
  }
}

// alto: som "bem alto" escolhido pela cozinha. Onda quadrada, que corta
// melhor o barulho da chapa e do exaustor, no volume máximo.
// Pedido novo e aviso também vibram o celular (só no Android).
export function tocarAlerta(tipo = 'novo', { alto = false } = {}) {
  if (tipo === 'novo') vibrar(alto ? [250, 120, 250, 120, 250] : [250, 120, 250]);
  else if (tipo === 'aviso') vibrar(200);
  if (contexto?.state !== 'running') return false;
  const { notas, repeticoes } = SONS[tipo];

  const volume = contexto.createGain();
  volume.gain.value = alto ? 1 : 0.8;
  volume.connect(contexto.destination);

  const inicio = contexto.currentTime + 0.02;
  for (let vez = 0; vez < repeticoes; vez++) {
    notas.forEach((frequencia, i) => {
      const t = inicio + vez * 0.6 + i * 0.13;
      const oscilador = contexto.createOscillator();
      const envelope = contexto.createGain();
      oscilador.type = alto ? 'square' : 'sine';
      oscilador.frequency.value = frequencia;
      envelope.gain.setValueAtTime(0.0001, t);
      envelope.gain.exponentialRampToValueAtTime(0.6, t + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      oscilador.connect(envelope).connect(volume);
      oscilador.start(t);
      oscilador.stop(t + 0.45);
    });
  }
  return true;
}
