# Bench

`npm run bench` mede três coisas e falha se algum portão ficar vermelho:

| subcomando | o que mede | portão |
|---|---|---|
| `contagem` | quantidade exata por item em 102 folhas com gabarito | ≥ 90% exatos · 0 confirmados errados |
| `legenda` | itens da legenda em 80 folhas nunca vistas (`legenda/`) | ≥ 66 folhas perfeitas · 0 lixo |
| `lista` | 144 folhas de pranchas públicas reais | 0 lixo confirmado |

`npm run bench -- contagem` roda só um. Variáveis: `SET=normal,dificil,lote,sinteticas`, `PAR=4` (processos em paralelo), `V=1` (detalhe por item).

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

## Pranchas públicas

O subcomando `lista` usa `plans-externas/` (pranchas de editais públicos, 27 MB), distribuído à parte em `plans-externas.zip`. Descompacte na raiz do projeto ou aponte `PLANS_EXT=/caminho`. Sem ela, o subcomando é pulado.
