# Bench

`npm run bench` mede quatro coisas e falha se algum portão ficar vermelho:

| subcomando | o que mede | portão |
|---|---|---|
| `contagem` | quantidade exata por item em 102 folhas com gabarito | ≥ 94% exatos · 0 confirmados errados |
| `clique` | o que ficou em Revisar: apontar UM exemplar resolve? | 0 itens sem saída |
| `legenda` | itens da legenda em 80 folhas nunca vistas (`legenda/`) | ≥ 66 folhas perfeitas · 0 lixo |
| `lista` | 144 folhas de pranchas públicas reais | 0 lixo confirmado |

`npm run bench -- contagem` roda só um. Variáveis: `SET=normal,dificil,lote,sinteticas`, `PAR=4` (processos em paralelo), `V=1` (detalhe por item).

O `clique` fecha o contrato do produto. O Orcer nunca chuta: quando o desenho da planta não é o ícone da legenda, o item vai para **Revisar** e a tela pede "Aponte um na planta". Esse pedido só é honesto se apontar resolver — então todo item que o motor não acertou sozinho recebe um retângulo em volta de UMA ocorrência do gabarito e é julgado pela mesma régua da contagem. O clicador não escolhe pelo resultado: fica com o primeiro retângulo que o motor aceita sem reclamar, e quando o motor reclama ("cortou", "pegou só um traço", "só achei o que você apontou") ele abre um pouco e tenta de novo — que é o que a tela manda a pessoa fazer.

## Os arquivos

- `gt_count.json`, `gt_hard.json` — gabaritos dos conjuntos *normal* e *difícil*. As folhas (`pdf2/`, 746 MB) não vão no repositório: gere-as.
- `lote/` — folhas geradas em lote (legenda "cega", cercas, intrusos; semente no `.json`), com o gabarito ao lado de cada `.pdf`. Vão prontas (3 MB).
- `sinteticas/` — folhas com gabarito por camada.
- `legenda/` — folhas para medir a leitura da legenda (`gt.json`).
- `legenda-publicas.json` — o que é e o que não é material nas pranchas públicas.
- `gerar/` — os geradores.

## Gerar `pdf2/`

```bash
pip install pymupdf Hershey-Fonts
cd bench
python3 gerar/gen2.py 40 5000 cnt /tmp/gt_count.json
python3 gerar/gen3.py 30 7000 hard /tmp/gt_hard.json
cmp /tmp/gt_count.json gt_count.json && cmp /tmp/gt_hard.json gt_hard.json && echo "gabaritos idênticos"
```

As sementes são fixas: as 70 folhas saem sempre iguais e os gabaritos batem byte a byte (conferido com pymupdf 1.28.2).

> **29/09/2026 — correção no gerador.** Na legenda em duas colunas, o bloco declarava a largura pela descrição INTEIRA em vez da linha já quebrada, e a segunda coluna era empurrada para fora da folha: o pymupdf cortava o texto e sobrava a primeira letra de cada linha. O gabarito cobrava 7 itens que não estavam no papel (cnt015, cnt020) e nenhum leitor podia achá-los. Corrigido em `gerar/gen.py` e `gerar/gen2.py`; `gt_count.json` foi regerado e mudou só nas 3 folhas de estilo `columns`, sem mexer em nenhuma contagem (1713 instâncias antes e depois). `gt_hard.json` ficou byte a byte igual.

## Pranchas públicas

O subcomando `lista` usa `plans-externas/` (pranchas de editais públicos, 27 MB), distribuído à parte em `plans-externas.zip`. Descompacte na raiz do projeto ou aponte `PLANS_EXT=/caminho`. Sem ela, o subcomando é pulado.
