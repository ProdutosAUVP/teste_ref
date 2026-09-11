# Salvando o acervo

Referências guarda tudo no navegador, e é isso que deixa a interface instantânea
e o app inteiro funcionando offline. O problema é que navegador esquece: basta
limpar os dados do site, trocar de perfil, reinstalar o navegador ou formatar a
máquina e o acervo vai junto.

A resposta é a **pasta do acervo** — uma pasta de verdade no computador, onde
cada alteração é gravada na hora:

```
A pasta que você escolher/
├─ acervo.json          boards, referências, tags, anotações e preferências
└─ imagens/<id>.webp    uma imagem por referência
```

Isso **não é um export**. Você não aperta nada, não escolhe um momento, não
precisa lembrar: salvar uma referência é gravar na pasta. E na abertura
seguinte é de lá que o acervo volta, se o navegador tiver esquecido.

> O formato é o mesmo nas duas versões (a página publicada e o app completo),
> então uma pasta gravada por uma abre na outra.

---

## Na página publicada (ou no `index.html` solto)

Barra lateral → o rodapé que diz onde o acervo está salvo → **Escolher a
pasta**. Daí em diante o rodapé mostra `Salvo em <pasta>/`.

Precisa de um navegador baseado em Chromium (Chrome, Edge, Brave, Arc, Opera):
só eles deixam uma página gravar direto numa pasta. No Firefox e no Safari o
botão explica isso e o acervo segue vivendo só no navegador.

**Ao reabrir**, o Chrome costuma pedir permissão de novo pra pasta — aparece um
aviso com **Reconectar** e um clique resolve. Pra ele parar de perguntar, marque
"Permitir sempre neste site" quando o navegador oferecer.

**Se o navegador for limpo**, a página abre com o acervo de exemplo. Clique em
**Já tenho uma pasta de acervo** (no estado vazio) ou em **Escolher a pasta** e
aponte a mesma pasta: tudo volta — imagens inclusive — e os exemplos que você
nunca tocou saem de cena sozinhos.

**Dica que vale por um serviço:** escolha uma pasta dentro do Google Drive, do
OneDrive ou do Dropbox. O acervo passa a ir pra nuvem e pro outro computador sem
mais nenhum passo, e sem conta nenhuma no app.

---

## No app completo (`npm run dev` / `npm start`)

Aqui quem grava é o servidor, então funciona em qualquer navegador — e a
recuperação é automática: se o navegador esquecer o acervo, ele volta de disco
na próxima abertura, sem clique nenhum.

```bash
npm run dev            # já vem ligado, gravando em ./data
VAULT_DIR=./acervo npm start   # em produção, escolha a pasta
```

| Situação | Pasta do acervo |
| --- | --- |
| `npm run dev`, sem `DATABASE_URL` | ligada em `./data` |
| `VAULT_DIR=<caminho>` | ligada em `<caminho>` (relativo ou absoluto) |
| `VAULT_DIR=off` | desligada |
| Produção sem `VAULT_DIR` | desligada |

A barra lateral passa a mostrar `Salvo em …/data`, e **Ajustes** tem o caminho
completo e um botão de gravar agora.

Produção vem desligada de propósito: em servidor serverless o disco é efêmero
(a pasta some no próximo deploy) e o app costuma ser público — e **a pasta não
tem senha**: quem alcança o app alcança o acervo. Ligue em produção só quando o
disco for persistente e o acesso já for restrito. Pra acervo de verdade em
servidor público, o caminho é a [sincronização com conta](../README.md#sincronizar-entre-dispositivos).

---

## Como o disco e o navegador se conciliam

O IndexedDB continua sendo a fonte de render — a tela nunca espera o disco. Por
cima dele:

- **Toda escrita agenda uma gravação.** Um segundo depois da última alteração a
  pasta é regravada inteira. Uma rajada (colar vinte links de uma vez) vira uma
  gravação só, e fechar a aba força o que estiver pendente.
- **O `acervo.json` é trocado por inteiro, nunca remendado.** A gravação vai
  primeiro num arquivo temporário e só então substitui o antigo: um travamento
  no meio não deixa o arquivo pela metade.
- **Imagem se grava uma vez.** O nome do arquivo é o id da referência, então o
  que já está na pasta não sobe de novo — e o que nenhuma referência aponta mais
  é apagado.
- **Na abertura, vence o mais recente.** Se a pasta tem uma versão mais nova de
  uma referência, ela entra; se este navegador tem, ele fica. Trazer de volta
  nunca desfaz uma edição recente.
- **Se a pasta ainda estiver como a deixamos, nada é lido.** A comparação é o
  carimbo de horário da última gravação — por isso abrir o app cem vezes não
  custa cem leituras do acervo inteiro.

### O que ele não é

Não é sincronização. Dois computadores gravando na mesma pasta (via Drive, por
exemplo) funcionam bem no uso normal, porque cada abertura traz o que o outro
escreveu, mas **uma exclusão feita com a pasta desconectada volta atrás**: sem
lápide no arquivo, o que existe na pasta e não existe aqui é lido como coisa a
recuperar, não como coisa apagada. Pra várias máquinas ao mesmo tempo, com
exclusão propagando de verdade, use a sincronização com conta.

E não substitui um backup fora da máquina: a pasta protege contra perder o
navegador, não contra perder o computador. **Ajustes → Exportar tudo** continua
sendo a cópia portátil, num arquivo só.
