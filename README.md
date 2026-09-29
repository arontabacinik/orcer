# Orcer

**Solte a prancha, receba a lista de materiais.** O Orcer lê a legenda de um projeto elétrico em PDF (o símbolo desenhado e o texto ao lado), conta cada símbolo na planta e entrega a lista de materiais em CSV, com cada ocorrência marcada no desenho.

Tudo roda no navegador: o PDF não sai do computador de quem usa.

## Números (medidos, não prometidos)

| conjunto | itens | quantidade exata | confirmados errados |
|---|---:|---:|---:|
| normal (folhas geradas, 31 folhas) | 203 | 203 · 100% | 0 |
| difícil (girado, escaneado, texto em curva) | 125 | 125 · 100% | 0 |
| lote (o desenho da planta NÃO é o ícone da legenda) | 120 | 92 · 76,7% | 0 |
| sintéticas (gabarito por camada) | 88 | 88 · 100% | 0 |
| **total** | **536** | **508 · 94,8%** | **0** |

E os 28 que sobraram? **Todos os 28 se resolvem apontando um exemplar na planta** — um clique por item, medido, não prometido (`npm run bench -- clique`). Sozinho o Orcer acerta 94,8%; com um clique no que ele mesmo marcou como Revisar, 536 de 536.

Metros de rota (eletroduto, eletrocalha) a até 2%: 40 de 44. Legenda em 80 folhas nunca vistas: 99% dos itens achados, 100% do que foi entregue é item de verdade. Em 144 folhas de pranchas públicas reais: nenhum texto de lixo confirmado como material.

**"Confirmado" quer dizer "pode comprar".** Quando o Orcer não tem certeza, a linha vem como **Revisar**, com o motivo e as ocorrências marcadas na planta — nunca um número confiante e errado. Nenhum dos 536 itens saiu confirmado e errado.

## Rodar

Precisa de Node 18 ou mais novo.

```bash
npm install
npm run dev          # abre em http://localhost:5173
npm run build        # gera o site estático em dist/ (pode ir para qualquer hospedagem)
npm run preview      # serve o dist/
```

Linha de comando (mesmo motor):

```bash
npm run contar -- prancha.pdf [outra.pdf ...] [--csv lista.csv]
```

Testes e medição:

```bash
npm test             # conferência rápida: exemplo + sintéticas + lote (segundos)
npm run typecheck
npm run bench        # medição completa: contagem, clique, legenda e lista. Veja bench/README.md
```

## Como funciona

1. **Lê o PDF vetorial** (pdf.js): traços, camadas, cores e textos — inclusive texto que o CAD gravou como curvas (lido por forma, `src/motor/vocr.ts`).
2. **Acha a legenda** pela forma (`src/motor/legendx.ts`): a coluna de símbolos com a coluna de texto ao lado, com ou sem a palavra LEGENDA/LEGEND/LEYENDA.
3. **Conta na planta** (`src/motor/motor.ts`): procura o desenho de cada símbolo em qualquer rotação, espelhamento e escala, e confere cada candidato dos dois lados — o candidato precisa conter o ícone e o ícone precisa conter o candidato (`src/motor/identidade.ts`). Rotas (eletroduto, eletrocalha) viram metros pela escala da folha.
4. **Decide sozinho** quando o ícone da legenda não aparece igual na planta, por dois caminhos, e os dois entregam **Revisar** com o método escrito:
   - a **recusa repetida**: o juiz recusou N lugares pela margem *exatamente* igual, no mesmo desenho e no mesmo tamanho. Uma parede ou um pedaço de móvel não reproduz a mesma fração de contenção em 27 lugares; um bloco inserido 27 vezes reproduz. A margem constante é a convenção de desenho daquela prancha;
   - o **clique automático**: escolhe o desenho repetido que mais se parece com o ícone e conta por ele.
5. **Monta a lista** (`src/lista.ts`) e o CSV: `DESCRIÇÃO;QUANTIDADE;UNIDADE;SITUAÇÃO;COMO FOI CONTADO;FOLHA;ARQUIVO` — com BOM, ponto e vírgula e vírgula decimal, abre direto no Excel.

Na tela, **Apontar um na planta** deixa a pessoa desenhar um retângulo em volta de um exemplar; o Orcer reconta aquele item por esse desenho.

```
src/
  motor/      o motor (TypeScript): vocr, legendx, identidade, motor, tipos
  ler.ts      lê um PDF folha a folha; folha sem legenda usa a legenda de outra folha do arquivo
  lista.ts    a lista para a tela e o CSV
  web/        o site: main.ts (tela), worker.ts (o motor num Web Worker), estilo.css
tools/        contar.ts (linha de comando), bench.ts (medição), testes.ts (npm test)
bench/        gabaritos e geradores (veja bench/README.md)
```

## Limites

- Precisa de **PDF vetorial exportado do CAD**. Folha escaneada (imagem) é avisada, não contada.
- Quando o símbolo da planta é muito diferente do ícone da legenda, o item cai em **Revisar** com contagem zero e o aviso "sobraram N desenhos repetidos sem dono". Um clique em *Apontar um na planta* resolve: nas 28 vezes em que isso aconteceu no benchmark, resolveu as 28.
- Rota (eletroduto, eletrocalha) numa prancha **monocromática** cujo traço da legenda está na camada da própria legenda: nem a cor nem a camada ligam a legenda ao desenho, e o Orcer entrega 0 m. São 4 das 44 medições de metro do benchmark.

## O ensaio

[**O Orcer e a recusa repetida**](ENSAIO.md) — como o motor chegou a 508/536, por que os 28 que sobram se resolvem com um clique, e o que foi preciso descobrir sobre o próprio benchmark para saber que os números estavam certos.

## Privacidade

Plantas de cliente são intocáveis: nunca entram neste repositório, nos testes nem no bench. Os testes usam só folhas geradas (`bench/gerar`), o exemplo em `public/exemplos` e pranchas públicas de editais (`plans-externas.zip`, fora do repositório).
