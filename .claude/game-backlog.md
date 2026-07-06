# Deep Ocean Explorer v2 — Game Improvement Backlog

Fila de aprimoramentos para o loop horário. Cada iteração escolhe 1–2 itens,
implementa, verifica no preview (tsc + gameplay simulado + screenshot) e marca aqui.

## Megafauna (pedido do usuário — prioridade alta)
- [x] **Arraias-manta** — 2–3 mantas planando em círculos largos com batida de asa
      procedural (vertex shader), banking nas curvas, empurrão suave no contato. (iteração 1)
- [x] **Tartarugas-marinhas** — 2 tartarugas em wander suave de meia-água (5–26 m),
      remada de "voo subaquático" nas nadadeiras dianteiras, traseiras como leme;
      missão "SHELL COMPANION" (20 s ao lado de uma tartaruga). (iteração 2)
- [x] **Polvo** — morador do fundo (~110 m) em 5 esconderijos resolvidos contra o
      terreno real; camuflagem ardósia→coral que queima ao aproximar (9 m), olhar
      segue o jogador; chegar a <2,8 m = jato de fuga com nuvem de tinta; missão
      "EYES OF THE ABYSS" (+240 XP). Material de pele único compartilhado. (iteração 4)
- [x] **Tubarão** — predador FSM (patrol→chase→bite|escape→cooldown) na banda
      25–60 m; recusa as águas rasas (<12 m = zona segura); bote custa 26 de energia
      + knockback; missão "JAWS OF THE TWILIGHT" (sobreviver a uma perseguição).
      Cauda de 3 juntas com frequência ligada ao esforço. (iteração 3)

## Experiência / imersão
- [ ] Áudio ambiente (WebAudio): drone subaquático por zona de profundidade,
      "ping" bioluminescente ao comer plâncton, whoosh no pulso.
- [ ] Beacon 3D de missão (coluna de luz/marcador no alvo quando aplicável).
- [ ] Minimap / radar circular (blooms de plâncton, NPCs, megafauna).
- [ ] Partículas de rastro atrás do jogador em alta velocidade.
- [ ] Modo foto (esconder HUD, câmera livre).

## Física / polish
- [ ] Vórtice visível no jato do sino (anel de partículas por pulso).
- [ ] Turbulência de esteira: NPCs próximos balançam quando o jogador passa rápido.
- [ ] Interação corrente × terreno (aceleração em desfiladeiros).

## Performance
- [ ] Instancing dos NPCs de mesma espécie; LOD de tentáculos por distância.
- [ ] Pausar useFrame de sistemas fora do frustum/distantes.

## Regras do loop
- Contador de iterações: `.claude/loop-iteration.txt` (parar após a 7ª e resumir).
- Manter arquitetura: stores mutáveis (lib/ocean.ts, lib/game.ts), zero setState no
  loop 3D, HUD a 8 Hz, scratch objects sem alocação por frame.
