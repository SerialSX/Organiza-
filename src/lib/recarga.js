const CHAVE_RECARGA = 'organiza-recarregou-apos-deploy';

// Depois de um deploy, a tela aberta procura arquivos do build antigo, que não
// existem mais. Nesse caso recarrega sozinha uma vez (pega a versão nova).
export function ehArquivoDeVersaoAntiga(erro) {
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|ChunkLoadError/i.test(
    erro?.message ?? '',
  );
}

export function semInternet() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

let esperandoInternet = false;

// Sem internet, o arquivo não veio porque a rede caiu, não por deploy. Recarregar
// agora trocaria o sistema pela página de erro do navegador (e o atendente
// perderia a tela). Espera a conexão voltar e só então recarrega.
export function recarregarUmaVez() {
  if (semInternet()) {
    if (!esperandoInternet) {
      esperandoInternet = true;
      window.addEventListener(
        'online',
        () => {
          esperandoInternet = false;
          recarregarUmaVez();
        },
        { once: true },
      );
    }
    return false;
  }
  try {
    if (sessionStorage.getItem(CHAVE_RECARGA)) return false;
    sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()));
  } catch {
    // sem sessionStorage: recarrega mesmo assim
  }
  window.location.reload();
  return true;
}

export function limparMarcaDeRecarga() {
  try {
    sessionStorage.removeItem(CHAVE_RECARGA);
  } catch {
    // nada a limpar
  }
}
