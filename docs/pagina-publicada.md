# A página publicada

`index.html`, na raiz do repositório, é a plataforma inteira num arquivo: sem
build, sem servidor, sem dependência. É um documento HTML completo, então dá
pra abrir com dois cliques ou servir como site estático.

**No ar em:** https://produtosauvp.github.io/teste_ref/

## Por que na raiz

O GitHub Pages tem dois modos. O arquivo na raiz faz o mais simples deles
funcionar sem configuração nenhuma:

| Modo | O que acontece |
| --- | --- |
| **Deploy from a branch** (raiz) — em uso | O Pages serve a raiz da branch padrão direto. Como existe `index.html`, é ele que abre. Nenhum workflow envolvido. |
| **GitHub Actions** | O workflow [`pages.yml`](../.github/workflows/pages.yml) monta e publica. Desligado por padrão; ligue criando a variável `PAGES_VIA_ACTIONS = true` em Settings → Secrets and variables → Actions → Variables. |

O `.nojekyll` na raiz é o detalhe que evita a armadilha clássica — e que já
mordeu uma vez aqui: sem ele, o Pages roda o Jekyll, que **renderiza o
`README.md` como se fosse a home** e a plataforma nunca aparece.

## O que o workflow faz

Ele não publica por padrão: serve de rede de proteção. A cada push que toca a
página, ele monta a pasta e confere que nada quebrou:

- copia `index.html` e `social-card.png`;
- copia `index.html` também como `404.html` — a plataforma é uma página só, então
  qualquer caminho errado cai no app em vez do 404 do GitHub;
- cria `.nojekyll`;
- confere que o documento está inteiro (doctype, charset, viewport, o app);
- **falha se a página passar a carregar qualquer coisa de outro domínio.** É a
  garantia de que ela continua funcionando offline e sob política de segurança
  restritiva. URL absoluta em `canonical` e nas tags `og:` passa: é metadado,
  não recurso buscado.

## Trocando de domínio

Três linhas no `<head>` de `index.html` são absolutas porque os robôs de
compartilhamento não resolvem caminho relativo: `canonical`, `og:url` e
`og:image`. Ao publicar em outro endereço, ajuste as três — o resto da página
não conhece o próprio domínio.

## Onde o acervo é salvo

O acervo vive no IndexedDB do navegador — e, se você quiser, também numa **pasta
de verdade do computador**, gravada pela própria página (File System Access API,
disponível em Chrome, Edge e outros Chromium):

```
A pasta que você escolher/
├─ acervo.json
└─ imagens/<id>.webp
```

Cada alteração é gravada nela na hora, e na abertura seguinte a página lê de
lá. É o que faz o acervo sobreviver a limpar os dados do navegador ou a trocar
de máquina — e é o mesmo formato do app completo, então a mesma pasta abre nos
dois. O botão está no rodapé da barra lateral, na linha que diz onde o acervo
está salvo. Detalhes em [salvando-o-acervo.md](salvando-o-acervo.md).

Sem pasta escolhida, a página avisa em amarelo que o acervo só existe no
navegador — e pede armazenamento persistente pra ele ao menos não ser descartado
sozinho quando o disco apertar.

## Hospedando em outro lugar

Sem Pages, o arquivo continua sendo só um arquivo:

| Onde | Como |
| --- | --- |
| **Netlify / Vercel** | Arraste o `index.html` na área de deploy |
| **Cloudflare Pages** | Aponte para a raiz, sem comando de build |
| **S3, nginx, Apache** | Suba e sirva como `index.html` |
| **Sem servidor nenhum** | Abra direto do disco: `file://` funciona, inclusive salvando |

Servida por HTTP (Pages, Netlify, um `python3 -m http.server`), a página também
grava na pasta do acervo. Aberta como `file://`, alguns navegadores restringem o
seletor de pastas — se o botão não responder, sirva o arquivo em vez de
abri-lo.

## O que muda em relação ao app completo

Sem servidor, duas coisas ficam de fora — e a própria página explica isso em
"Como esta página funciona", no rodapé da barra lateral:

- **Metadados de link.** O navegador não consegue ler o HTML de outro domínio
  (CORS), então o título vem do próprio endereço e não há capa vinda do site.
  O card já nasce editável.
- **Sincronização entre dispositivos**, que depende de conta e banco.

Uma coisa muda de dono: **a pasta do acervo é escolhida por você no seletor do
navegador**, em vez de configurada por `VAULT_DIR` no servidor — e por isso
depende de um navegador Chromium, enquanto no app completo funciona em qualquer
um. O Chrome também costuma repedir a permissão da pasta a cada reabertura; a
página mostra um aviso com "Reconectar".

Todo o resto é igual: captura de links, notas, imagens e **paletas de cor**,
boards, tags automáticas, busca ⌘K, anotações, referências relacionadas, três
visões, atalhos de teclado, tema claro/escuro e backup em JSON. O formato do
backup é o mesmo do app completo, então um export daqui importa lá e vice-versa.

A **capa dos cards de site** é gerada aqui: uma placa com o domínio real, no tom
derivado dele. Não é foto da página — sem servidor o navegador não consegue
buscar a `og:image` de outro domínio. Na versão completa, quando o site publica
uma, é ela que aparece.

## Como está construído

Vanilla JS, sem framework. Os mesmos tokens de cor do app
(`src/app/globals.css`) e a mesma lógica de produto — busca fuzzy,
auto-tagging, pontuação de relacionadas — reescritos sem React para caber num
arquivo.

Os "estudos de cor" do acervo de exemplo são desenhados no canvas quando a
página abre pela primeira vez: como capas remotas não carregam, é assim que o
mural mostra cards de imagem de verdade.

Nada externo é carregado — nenhuma fonte, script ou imagem de outro domínio. O
ícone da aba é um SVG embutido como data URI. `social-card.png` é o único
arquivo além do HTML, e serve só para o preview do link nas redes.
