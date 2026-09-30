# O Orcer e a recusa repetida

*30 de setembro de 2026 · sobre a versão 1.1*

O Orcer lê a legenda de um projeto elétrico em PDF, conta cada símbolo na planta e entrega a lista de materiais. Nesta versão ele acerta a quantidade exata de 508 dos 536 itens do benchmark (94,8%) e **zero** dos 536 sai confirmado e errado. Guarde uma ressalva desde já, porque ela volta perto do fim e muda o peso de tudo: **todas essas 536 folhas foram geradas pelo próprio projeto**, e nenhum desses números foi medido numa prancha real. Este ensaio é sobre as ideias que fecharam a distância medida, sobre o que foi preciso recusar pelo caminho, e sobre a medida que faltava.

## O contrato

Num orçamento de obra, um número errado não é um erro de software: é material comprado a mais que fica no canteiro, ou material a menos que para a equipe na sexta-feira. Quem faz o levantamento à mão sabe exatamente onde está inseguro. Um programa que devolve uma planilha limpa apaga essa informação — e apagar a dúvida é pior do que não contar.

Daí o único contrato do Orcer: **"Confirmado" quer dizer "pode comprar"**. Uma linha só sai confirmada quando cada ocorrência contada foi provada como sendo o símbolo da legenda. Quando a prova não fecha, a linha sai como **Revisar**, com o número que o motor conseguiu, o motivo por escrito e cada ocorrência marcada no desenho.

O contrato é fácil de enunciar e caro de manter, porque ele proíbe exatamente o atalho que todo sistema de contagem quer tomar: na dúvida, chutar o mais provável. O benchmark cobra isso com um teto que não é uma meta, é zero — nenhuma quantidade confirmada pode estar errada. Em 536 itens, nenhuma está.

O que esse contrato *permite*, e é onde mora o trabalho difícil, é entregar um número sem prova, desde que ele venha rotulado como tal. Revisar com 27 unidades e o método escrito é útil. Revisar com zero é quase inútil. A diferença entre as duas coisas é o assunto deste ensaio.

## O juiz, e por que a volta importa

O Orcer não classifica imagens. Ele lê os traços que o CAD gravou no PDF e pergunta, lugar por lugar: **este pedaço da planta é o ícone da legenda?** A pergunta é respondida por semelhança pura — girar, espelhar, mudar de escala, nunca esticar nem entortar — e tem de dar certo nos dois sentidos:

- **ida**: todo traço do ícone cai sobre tinta da planta ali;
- **volta**: toda a tinta dali cai sobre traço do ícone.

A volta parece redundante e não é. Sem ela, o hexágono da legenda "é" o círculo com uma letra dentro, porque o círculo cobre o hexágono inteiro. Sem ela, o círculo vazio "é" o círculo preenchido. Esticar também parece inofensivo e não é: um quadrado com uma diagonal, esticado, vira qualquer célula de qualquer tabela da prancha.

O juiz devolve dois números — quanto da ida fechou (`fw`) e quanto da volta fechou (`rv`) — e só aprova com 95% dos dois lados. É um juiz severo, e a severidade é o que sustenta o contrato: os 370 itens que saem confirmados saem confirmados porque passaram por ele.

Mas um juiz severo produz muita recusa. E foi olhando para as recusas, e não para as aprovações, que apareceu a ideia que faltava.

## A recusa repetida

O conjunto mais duro do benchmark chama-se *lote*: 30 folhas em que o desenho da planta **de propósito não é** o ícone da legenda. A legenda mostra o símbolo simplificado e a planta o desenha detalhado; ou o contrário; ou a planta usa um esquemático que só lembra o ícone. É o que pranchas reais fazem o tempo todo, e era onde o Orcer parava: 86 de 120.

Numa dessas folhas, o item "LIGHT FIXTURE LED 2X18W" saiu com **zero**. O gabarito diz 27. Olhando o que o juiz tinha recusado ali, apareceu isto:

| recusas | ida (`fw`) | volta (`rv`) | tamanho | tamanho / ícone |
| --- | ---: | ---: | ---: | ---: |
| 27 | 0,87 | 0,68 | 13,4 pt | 1,00 |

Vinte e sete recusas. Todas com a **mesma** ida, até a segunda casa. Todas com a **mesma** volta. Todas do mesmo desenho, todas do mesmo tamanho, e esse tamanho igual ao do ícone.

O limiar existente exigia ida ≥ 0,95 para tratar a diferença como convenção de desenho, e 0,87 ficava de fora — com razão, porque 0,87 sozinho não quer dizer nada. Mas 0,87 **vinte e sete vezes seguidas, idêntico**, quer dizer muito. Um pedaço de parede não reproduz a mesma fração de contenção em 27 lugares. Um canto de móvel não reproduz. Um bloco de CAD inserido 27 vezes reproduz, e só ele.

A margem constante não é ruído. É a diferença fixa entre como a legenda desenha aquele símbolo e como a planta o desenha — quer dizer, a convenção de desenho daquela prancha. O juiz não errou ao recusar: aquilo de fato não é o ícone. O que ele não sabia é que **errar sempre igual é uma informação**.

A regra que saiu disso é curta e cheia de cercas:

- só para item que saiu **zero** — onde já há ocorrência provada, somar um monte de "quase" mistura duas provas de força muito diferente;
- **três ou mais** recusas — duas podem ser coincidência;
- ida e volta com dispersão ≤ 0,02 entre todas — é a uniformidade que argumenta, não o valor;
- o mesmo desenho (mesma assinatura de operações) e o mesmo tamanho a 2%;
- nenhum outro item da legenda reivindicando aquele desenho;
- e sai **sempre como Revisar**, com o método escrito na linha.

Seis itens a mais exatos no lote. Nenhuma piora nos outros 416. E nada disso pode virar "Confirmado", porque nada disso é identidade — é repetição, que é outra coisa e está escrita como outra coisa.

## A saída de emergência precisava ter saída

A regra nova resolveu seis itens. Sobraram 28, e a resposta do Orcer para eles é sempre a mesma: a linha vai para Revisar com o aviso *"sobraram N desenhos repetidos sem dono, do tamanho dele. Aponte um na planta se for este material — isto não é zero."* A pessoa desenha um retângulo em volta de um exemplar e o Orcer reconta aquele item por aquele desenho.

Esse pedido é a saída de emergência do produto inteiro. E ninguém nunca tinha medido se ela abre.

Então medi. Todo item que o motor não acerta sozinho recebe um retângulo em volta de uma ocorrência do gabarito, e o resultado é julgado pela mesma régua da contagem: quantidade exata **e** cada marca sobre uma ocorrência real. O clicador de mentira não escolhe pelo resultado — fica com o primeiro retângulo que o motor aceita sem reclamar, e quando o motor reclama, abre um pouco e tenta de novo, que é o que a tela manda a pessoa fazer.

Na primeira rodada: **23 de 28**. Os cinco que faltavam eram todos o mesmo item — o quadro de distribuição — e a causa era boa de achar e constrangedora de encontrar.

O motor tem uma proteção contra retângulo mal desenhado: se um traço do tamanho de símbolo atravessa a borda encostando no que ficou dentro, o retângulo **cortou** o desenho, e meio símbolo casaria com qualquer coisa que tenha aquela metade. Sensata. Mas nessas folhas havia uma marcação de parede desenhada colada no quadro. Encostava. Tinha o tamanho certo. E fazia o retângulo **correto** ser recusado — todos eles, de qualquer tamanho. A saída de emergência estava trancada por dentro.

A correção é uma frase: **a camada diz o que é o símbolo; o retângulo diz só onde ele está.** O CAD já separa o símbolo do mobiliário, da cota e da marcação de parede. Quando quase toda a tinta de dentro do retângulo está numa camada e sobra um resto pequeno de outra, o resto é vizinhança que entrou junto, não parte do desenho — e um traço de outra camada que encosta na borda não é "o resto dele". Encostar não é ser.

Apareceu junto um segundo defeito, menor e mais feio: retângulo **menor** que o símbolo não fazia nada. Nenhuma contagem, nenhum aviso, nenhum motivo. A pessoa clicava de novo sem saber o que tinha acontecido. Agora ele diz o que fazer.

Com as duas correções: **28 de 28**. E isso virou um portão permanente do benchmark, `npm run bench -- clique`, que falha se algum dia um item ficar sem saída.

## O gabarito cobrava o que não estava no papel

O portão do clique tem uma cláusula que parecia burocrática: item que o motor nem colocou na lista não tem onde clicar, então conta à parte. Sete itens caíram nessa cláusula, todos em duas folhas.

Fui ver por quê. As duas folhas têm a legenda em duas colunas, e o motor lia a primeira e perdia a segunda inteira. Parecia um defeito claro do leitor de legenda — até eu abrir o PDF e procurar o texto que faltava. Estava lá, assim:

```
'Q'  [46.2, -1.1, 52.1, 2.2]
'L'  [52.0, -0.2, 57.9, 2.2]
'P'  [66.6, -0.7, 72.5, 2.2]
```

Uma letra por linha. "Q" de "QUADRO DE DISTRIBUIÇÃO DE", "L" de "LUZ - NOVO", "P" de "PONTO DE DADOS/VOZ RJ45 CAT6". O gerador do benchmark desenhava a segunda coluna da legenda para fora da borda direita da folha, e a biblioteca que escreve o PDF cortava o texto no limite do papel. Sobrava a primeira letra de cada linha.

**O gabarito cobrava sete itens que não estavam no papel.** Nenhum leitor poderia achá-los — nem o Orcer, nem uma pessoa, nem nada. O motor estava certo e a régua estava errada, e a régua errada estava na página inicial do projeto como um número a menos, havia meses.

A causa era de uma linha: ao calcular a própria largura, o bloco da legenda media pela descrição **inteira** em vez da linha já quebrada. Declarava-se muito mais largo do que desenhava, e empurrava a coluna seguinte para fora.

Corrigido o gerador, as folhas foram regeradas com as mesmas sementes. O gabarito mudou só nas três folhas de legenda em duas colunas; nenhuma contagem se mexeu (1.713 instâncias antes e depois) e o gabarito do conjunto *difícil* saiu byte a byte igual. O conjunto *normal* passou de 196/203 para **203/203**.

Nenhuma linha do motor mudou para isso acontecer. É o tipo de ganho de que se desconfia com razão — por isso o registro do que mudou está no [`bench/README.md`](bench/README.md), com a causa, o diff e o que continuou idêntico. Um benchmark também é código, e ninguém tinha medido o medidor.

## O que ficou de fora

Onde o benchmark parou:

| conjunto | itens | quantidade exata | confirmados errados |
| --- | ---: | ---: | ---: |
| normal | 203 | 203 · 100% | 0 |
| difícil (girado, escaneado, texto em curva) | 125 | 125 · 100% | 0 |
| lote (o desenho da planta NÃO é o ícone) | 120 | 92 · 76,7% | 0 |
| sintéticas (gabarito por camada) | 88 | 88 · 100% | 0 |
| **total** | **536** | **508 · 94,8%** | **0** |

Desses, **409 saem confirmados** — e nas folhas em que a planta desenha o que a legenda mostra, 94,5% das linhas saem sem pedir revisão.

Os 28 do lote se resolvem todos com um clique. Duas coisas não se resolvem, e vale dizer por que não foram forçadas.

**Os 28 poderiam virar zero automaticamente?** Provavelmente não sem mentir. Nessas folhas, o melhor candidato para os itens que sobram pontua ida 0,66 e volta 0,60 — as formas são genuinamente diferentes. Baixar o limiar automático até pegar esses casos deixa entrar qualquer coisa. Uma versão anterior já tinha medido a alternativa óbvia (atribuir cada desenho órfão ao item cuja forma mais se parece) e registrado o resultado no código: acertava 6 de 18, ou seja, inventaria número em dois terços dos casos. A opção honesta é pedir o clique — e garantir que o clique funcione, que é o que foi feito.

**Quatro medições de metro, de 44, saem 0 m.** São duas folhas em que a planta é inteiramente preta e o traço da rota, na legenda, está desenhado na camada *da própria legenda*. Nem a cor nem a camada ligam a legenda ao desenho. Dá para inferir por eliminação — sobraram duas camadas com linha comprida, há dois itens de rota na legenda —, e eu não fiz: é exatamente o tipo de salto que o resto do motor recusa, e eu não tinha aqui o conjunto de pranchas públicas reais para medir quanto lixo isso traria junto. Mudar a doutrina do zero sem poder medir o custo seria trocar um limite conhecido por um risco desconhecido. Ficou anotado nos limites do README.

Uma ressalva sobre o próprio número: o portão das pranchas públicas reais (144 folhas, "nenhum texto de lixo confirmado como material") não pôde rodar nesta sessão, porque esse conjunto não está no repositório. O argumento de que ele continua verde é estrutural, não empírico: as duas alavancas novas só produzem **Revisar**, e o que aquele portão mede é lixo saindo como **Confirmado**. É um argumento bom, mas é um argumento — e a diferença entre um argumento e uma medida é o assunto do projeto inteiro.

## A volta que não olhava o preenchimento

Uma última coisa apareceu só quando fui olhar o **webapp**, e não o benchmark.

A página inicial oferece "ver com um exemplo". O exemplo é uma prancha sintética com sete materiais, e dois deles — a tomada de 10A e a de 20A — saíam em **Revisar**, com o aviso "mesmo desenho, na mesma cor: não sei separar qual é qual". Só que os dois símbolos são visivelmente diferentes: a de 20A é a de 10A **com um triângulo preenchido dentro**. É a convenção mais comum da simbologia elétrica brasileira.

O juiz é quem decide isso, e a volta — "toda a tinta dali cai sobre traço do ícone" — olha só a tinta **da cor do símbolo**, para que hachura ou mobiliário de outra cor passando por baixo não conte. O que estava errado era como a cor era comparada: pelo **par** (traço, preenchimento). O círculo é `vermelho|sem preenchimento`; o triângulo cheio é `vermelho|vermelho`. Pares diferentes — então o triângulo ficava de fora da conta, e o ícone da tomada de 10A "continha" um desenho que não contém. Volta 1,00. Gêmeos.

A correção é uma frase: **cor é a cor, não o par.** Tinta vermelha ali é do símbolo, preenchida ou não. Com uma cerca: só vale para cor **não neutra** — preto e cinza estão em toda prancha e não declaram nada. Sem essa cerca o ícone de traço preto passava a reivindicar a parede, e o quadro de distribuição caía a zero em seis folhas do lote; eu vi isso porque medi antes de acreditar.

Depois disso o exemplo abre com **7 de 7 confirmados**, cada quantidade ainda exata. E a mesma medição rendeu a segunda correção: quando o ícone é uma forma simples demais para provar sozinho (um triângulo, um círculo) e a planta o desenha em outra cor, a **camada** do CAD serve de segunda testemunha — se todas as ocorrências estão numa camada nomeada que nenhum outro item usa, e são três ou mais. Mais 14 itens confirmados no benchmark, zero confirmado errado.

O que me interessa aqui não é o conserto. É que ele estava invisível do lado de dentro: o benchmark cobra a **quantidade**, e a quantidade estava certa o tempo todo — 18 e 8, exatos. O que estava errado era o quanto o Orcer se dizia seguro. Isso não aparece numa tabela de acertos; aparece quando você abre a própria página inicial e o produto parece inseguro sobre o caso mais banal que existe.

## Olhar em vez de supor

O pedido seguinte foi o mais difícil de todos: *numa prancha que o Orcer nunca viu, 90% das linhas têm de sair sem pedir revisão*.

Eu já sabia o número: 384 dos 536 itens saíam confirmados — 71,6%. Mas esse número mistura coisas que não se misturam. O conjunto *lote* são 120 itens onde o desenho da planta **não é** o ícone da legenda, de propósito; ali "Revisar" é a resposta certa e confirmar seria exatamente a mentira que o produto promete não contar. Tirando o lote, era 83,7%. Faltavam sete pontos.

Fui ver de onde vinham, e os dois maiores motivos tinham a mesma forma:

- *"O ícone é uma forma simples e a cor da planta difere da legenda: **outra coisa da planta pode ter o mesmo desenho**."*
- *"Não achei este símbolo, mas sobraram N desenhos repetidos sem dono, **do tamanho dele**."*

Os dois são suposições sobre a planta. E o Orcer tem um juiz de identidade capaz de responder cada uma delas — que não estava sendo consultado. A régua do segundo caso era literalmente a **fita métrica**: qualquer desenho repetido de porte parecido bloqueava a resposta, e numa prancha real sempre sobra alguma coisa do tamanho de um símbolo.

Então passei a perguntar. Para cada um desses itens, o que sobrou sem dono na planta passa pelo juiz como sendo este ícone? Se nada passa, não há "outra coisa": todas as ocorrências daquele desenho já estão naquela linha, por exaustão. Isso é verificação, não suposição, e são 21 itens a mais confirmados sem tocar em nenhum limiar de identidade.

A terceira tentativa foi **recusada pela medida**, e é a que mais gosto. Qualquer recusa do juiz derrubava a confiança do item — mesmo uma recusa a 25%, que não é ocorrência perdida, é ruído do gerador de candidatos. Parecia óbvio exigir que a recusa fosse *próxima* para valer. Mas a régua tem de separar duas populações, e fui medir as duas:

| a recusada que mais quase passou | itens com a contagem certa | itens a quem faltou ocorrência |
|---|---:|---:|
| abaixo de 0,50 | 9 | **0** |
| acima de 0,70 | 23 | 6 |
| acima de 0,80 | 10 | 6 |

Num corte em 0,70 — o número que a intuição escolhe — eu confirmaria 6 itens a quem de fato faltou ocorrência. Seis mentiras. O corte que existe é 0,50, e ele rende 9 itens, não 23. Ficou escrito no código, com a tabela, para que ninguém tente 0,70 de novo.

O resultado, em 50 folhas que o motor não usou para se ajustar: **310 de 328 itens com resposta firme, 94,5%**. Trinta e quatro das 50 folhas não deixam nada para conferir; a pior deixa dois itens. Nenhuma quantidade confirmada errada, nenhum zero sobre item que existe.

E uma coisa que a medição desmontou: os 90% **por folha** não são uma meta que se possa cobrar. As folhas têm de 3 a 10 itens, então um único "Revisar" leva a folha de 100% direto para 75% ou 88% — não existe 90% nessa escala. O que dá para cobrar, e o que o portão `firmeza` cobra, é o trabalho que sobra: quantos itens a folha deixa para a pessoa conferir. Esse número não depende do tamanho da folha, e hoje ele é **dois, no pior caso**.

## O número que eu não tinha medido

Preciso corrigir este ensaio no meio dele, porque ele passou seis seções dizendo um número com mais confiança do que o número merecia.

Todas as 536 folhas do benchmark — as 203 do conjunto *normal*, as 125 do *difícil*, as 120 do *lote*, as 88 *sintéticas* — foram **geradas por `bench/gerar`**. Os gabaritos são exatos porque o mesmo script que desenhou a folha escreveu o gabarito. Até as "80 folhas que o motor nunca viu", que eu citei como prova de generalização, saem do mesmo gerador com outra semente: são um conjunto de validação, não pranchas do mundo.

O único material real do projeto são 144 páginas de pranchas de editais públicos, e o que existe sobre elas é uma lista de 206 julgamentos do tipo `{arquivo, página, texto, é material: sim/não}`. **Sem uma única quantidade de gabarito.** Esse conjunto pode dizer se o Orcer chamou de material um texto que não é; não pode dizer se ele contou certo. Nunca pôde.

Então: **"94,8% dos itens com a quantidade exata" nunca foi medido numa prancha real.** Nem uma vez. E eu ajustei limiares contra essas mesmas folhas nesta versão — o corte de 0,50 das recusas, a exaustão, a camada como testemunha. Um número ajustado no conjunto em que é medido não é uma medida, é um eco.

Dá para calibrar o quanto isso importa olhando para fora. O trabalho publicado em 2026 sobre detecção de símbolo em diagramas de construção reais fica em torno de **79% de mAP** com YOLO. Um motor que marca 94,8% num conjunto próprio não está 16 pontos à frente do estado da arte: está medindo outra coisa. A diferença entre os dois números não é qualidade, é dificuldade do conjunto.

O que isso não invalida: os **zeros**. "Nenhuma quantidade confirmada e errada em 536" continua sendo uma propriedade do motor e não do conjunto — um teto de zero é difícil de acertar por sorte, e as folhas do *lote* foram feitas de propósito para quebrá-lo. E continua não invalidando o raciocínio deste ensaio, que é sobre como decidir, não sobre a porcentagem.

O que isso invalida é a frase que eu escrevi na abertura. A medida que faltava agora existe e se chama `npm run aferir`: ela pega uma prancha de verdade, desenha um recorte de **cada ocorrência que o Orcer contou** a partir dos traços do próprio PDF, e pede que uma pessoa olhe e diga se confere. Nada sai do computador — nem precisa, porque o que se compartilha é o veredito, não o desenho. Enquanto ninguém rodar isso numa prancha real, o número honesto deste projeto é: **não sei**.

## O que "pronto" quer dizer aqui

Quase nada do que foi feito nesta versão foi melhoria no reconhecimento. Uma foi aprender a ler as recusas do próprio motor. Outra foi destravar uma saída que estava trancada por dentro. A terceira foi descobrir que a régua cobrava o que não existia. A quarta foi abrir a página inicial e ver o produto duvidar do caso mais simples que existe. Nenhuma delas é "o algoritmo ficou mais esperto".

Acho que esse é o formato normal de terminar um programa desses, e não a exceção. Um sistema que se recusa a chutar acumula, em vez de erros, **recusas** — e as recusas são dados. O padrão nelas foi o que fechou seis casos. O aviso que o produto dá quando desiste é uma promessa feita ao usuário, e ninguém tinha verificado se ela se cumpre; verificar virou um portão que roda para sempre. E medir o medidor devolveu sete itens que o motor sempre soube ler.

O número final não é 94,8%. É este:

> **508 de 536 sozinho. 536 de 536 com um clique no que ele mesmo marcou como Revisar. Nenhum dos 536 confirmado e errado.**

A segunda frase só vale porque a terceira é verdadeira. Se "Confirmado" fosse um palpite bem-educado, saber que o clique resolve o resto não serviria de nada — a pessoa não teria como saber onde clicar. O que torna o Orcer utilizável não é a fração que ele acerta: é ele saber, e dizer, de qual fração se trata.
