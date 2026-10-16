/* ============================================================
   STREET KINGS 1v1 — Lógica do jogo
   Arquivo: script.js
   ------------------------------------------------------------
   ORGANIZAÇÃO (para facilitar a leitura):
   1. Configurações (constantes)
   2. Elementos do HTML (DOM)
   3. Estado do jogo
   4. Entidades (jogador, adversário e bola)
   5. Teclado
   6. Funções de apoio (mensagens, reset, etc.)
   7. Ações (drible, chute, roubo de bola)
   8. Inteligência artificial (CPU)
   9. Física e colisões
   10. Gols, cronômetro e fim de partida
   11. Desenho (renderização no canvas)
   12. Loop principal
   13. Inicialização (botões)
   ============================================================ */

/* ---------------- 1. CONFIGURAÇÕES ---------------- */
const LARGURA = 900;            // largura do canvas
const ALTURA  = 500;            // altura do canvas
const CHAO_Y  = 420;            // "linha" do chão (onde os pés tocam o solo)
const GOL_ALTURA = 110;         // altura da boca do gol
const GOL_Y    = CHAO_Y - GOL_ALTURA;   // topo da boca do gol
const DURACAO_PARTIDA = 60;     // segundos
const GOLS_PARA_VENCER = 3;     // primeiro a marcar 3 vence na hora

/* ---------------- 2. ELEMENTOS DO HTML ---------------- */
const canvas    = document.getElementById("campo");
const ctx       = canvas.getContext("2d");
const elTimer   = document.getElementById("cronometro");
const elPlacarVoce = document.getElementById("placarVoce");
const elPlacarCpu  = document.getElementById("placarAdversario");
const telaInicial  = document.getElementById("telaInicial");
const telaResultado = document.getElementById("telaResultado");
const textoResultado = document.getElementById("textoResultado");
const textoPlacarFinal = document.getElementById("textoPlacarFinal");

/* ---------------- 3. ESTADO DO JOGO ---------------- */
const jogo = {
  rodando: false,     // a partida está acontecendo?
  tempo: DURACAO_PARTIDA,
  golsVoce: 0,
  golsCpu: 0,
  mensagens: [],      // mensagens flutuantes ("GOL!", "DRIBLE!")
  tempoGol: 0,        // pequena pausa de comemoração após cada gol
};

/* ---------------- 4. ENTIDADES ---------------- */

// Cria um personagem (jogador ou CPU)
function criarPersonagem(x, cor, nome) {
  return {
    x: x,
    y: CHAO_Y,
    vx: 0,
    cor: cor,
    nome: nome,
    facing: 1,             // para onde olha: 1 = direita, -1 = esquerda
    largura: 34,
    altura: 78,
    velocidade: 4.2,       // velocidade de movimento
    chutePronto: true,     // chute sem recarga?
    dribleCooldown: 0,     // tempo até poder driblar de novo
    dribleAtivo: 0,        // tempo restante do drible atual
    atordoado: 0,          // tempo que fica paralisado ao cair na finta
    animacao: 0,           // contador para animar pernas
    movendo: false,
  };
}

const voce = criarPersonagem(LARGURA * 0.30, "#39ff14", "VOCÊ");
const cpu  = criarPersonagem(LARGURA * 0.70, "#ff4757", "CPU");

// A bola começa no meio do campo, solta
const bola = {
  x: LARGURA / 2,
  y: CHAO_Y - 60,
  vx: 0,
  vy: 0,
  raio: 11,
  dono: null,   // quem tem a posse: voce, cpu ou null (solta)
};

/* ---------------- 5. TECLADO ---------------- */
// Guardamos as teclas pressionadas. Isso permite manter a tecla
// apertada e o personagem continuar andando sem repetir ação.
const teclas = {};

document.addEventListener("keydown", function (event) {
  teclas[event.code] = true;

  // Ações "unitárias": só disparam UMA vez por pressionamento,
  // mesmo se a pessoa segurar a tecla.
  if (event.repeat) return;

  if (jogo.rodando) {
    if (event.code === "Space") tentarDrible(voce, cpu);
    if (event.code === "KeyJ")  tentarChute(voce, -1); // você ataca o gol da ESQUERDA da CPU
  }
});

document.addEventListener("keyup", function (event) {
  teclas[event.code] = false;
});

/* ---------------- 6. FUNÇÕES DE APOIO ---------------- */

// Mensagens flutuantes que aparecem na tela
function mostrarMensagem(texto, cor) {
  jogo.mensagens.push({ texto, cor, x: LARGURA / 2, y: 160, vida: 1 });
}

// Volta jogadores e bola para a posição inicial (após gol ou reinício)
function reiniciarPosicoes() {
  voce.x = LARGURA * 0.30;
  cpu.x  = LARGURA * 0.70;
  voce.vx = 0; cpu.vx = 0;
  voce.atordoado = 0; cpu.atordoado = 0;
  voce.dribleAtivo = 0; cpu.dribleAtivo = 0;

  bola.x = LARGURA / 2;
  bola.y = CHAO_Y - 60;
  bola.vx = 0;
  bola.vy = 0;
  bola.dono = null; // bola solta no meio: disputa quem pega primeiro
}

function atualizarPlacarNaTela() {
  elPlacarVoce.textContent = jogo.golsVoce;
  elPlacarCpu.textContent = jogo.golsCpu;
}

// Inicia (ou reinicia) a partida do zero, sem acumular eventos
function iniciarPartida() {
  jogo.rodando = true;
  jogo.tempo = DURACAO_PARTIDA;
  jogo.golsVoce = 0;
  jogo.golsCpu = 0;
  jogo.mensagens = [];
  jogo.tempoGol = 0;

  voce.chutePronto = true;
  voce.dribleCooldown = 0;
  cpu.chutePronto = true;

  reiniciarPosicoes();
  atualizarPlacarNaTela();
  elTimer.textContent = jogo.tempo;
  elTimer.classList.remove("urgente");

  telaInicial.classList.add("escondida");
  telaResultado.classList.add("escondida");
}

/* ---------------- 7. AÇÕES ---------------- */

// Drible: avança com impulso e tem chance de "atordoar" o defensor.
// Se for usado longe do adversário, a CPU tem chance de roubar no embalo.
function tentarDrible(quem, adversario) {
  if (quem.dribleCooldown > 0 || quem.atordoado > 0) return;
  if (bola.dono !== quem) return; // só dá pra driblar com a bola

  quem.dribleAtivo = 0.35;              // duração do impulso
  quem.dribleCooldown = 1.2;            // tempo de recarga (anti-spam)
  quem.vx = quem.facing * 9;            // impulso na direção que está olhando

  const distancia = Math.abs(quem.x - adversario.x);

  if (distancia < 90) {
    // Finta em cima do marcador: alta chance de derrubar ele do lance
    if (Math.random() < 0.75) {
      adversario.atordoado = 1.1;
      adversario.vx = (adversario.x > quem.x ? 1 : -1) * 5; // empurra ele pra trás
      mostrarMensagem("DRIBLE! " + quem.nome + " enganou!", quem.cor);
    }
  }
}

// Chute: só com a posse da bola e com a recarga pronta.
// direcaoGol: -1 = gol da esquerda, 1 = gol da direita
function tentarChute(quem, direcaoGol) {
  if (!quem.chutePronto || bola.dono !== quem) return;

  quem.chutePronto = false;
  setTimeout(() => { quem.chutePronto = true; }, 900); // recarga de 0,9s

  bola.dono = null;
  // Chuta forte e levemente para cima, com variação para parecer real
  bola.vx = direcaoGol * (11 + Math.random() * 3);
  bola.vy = -(4 + Math.random() * 2.5);
  bola.x = quem.x + quem.facing * 30;

  mostrarMensagem("CHUTE!", quem.cor);
}

// Tenta roubar a bola do dono quando está perto.
// Devolve true se conseguiu roubar.
function tentarRoubo(ladrao, donoAtual) {
  const distancia = Math.abs(ladrao.x - donoAtual.x);
  if (distancia < 40 && Math.random() < 0.03) { // 3% por frame de contato
    bola.dono = ladrao;
    donoAtual.vx = -donoAtual.facing * 4; // empurra quem perdeu a bola
    mostrarMensagem("ROUBOU! " + ladrao.nome + " tomou a bola!", ladrao.cor);
    return true;
  }
  return false;
}

/* ---------------- 8. INTELIGÊNCIA ARTIFICIAL (CPU) ---------------- */
function atualizarCpu() {
  if (cpu.atordoado > 0) {
    cpu.movendo = false;
    return; // caiu na finta: não age enquanto estiver atordoado
  }

  const distanciaBola = Math.abs(cpu.x - bola.x);

  if (bola.dono === cpu) {
    // COM A BOLA: avança em direção ao gol do jogador (esquerda)
    cpu.facing = -1;
    if (cpu.x > LARGURA * 0.22) {
      cpu.vx = -cpu.velocidade;
      cpu.movendo = true;
    } else {
      cpu.vx = 0;
      cpu.movendo = false;
      tentarChute(cpu, -1); // perto do gol: chuta
    }

    // Drible ocasional para fugir quando o jogador está colado
    if (Math.abs(cpu.x - voce.x) < 70 && cpu.dribleCooldown <= 0 && Math.random() < 0.02) {
      tentarDrible(cpu, voce);
    }
  }
  else if (bola.dono === voce) {
    // SEM A BOLA: vai atrás do jogador para roubar
    cpu.facing = voce.x > cpu.x ? 1 : -1;
    cpu.vx = cpu.facing * cpu.velocidade;
    cpu.movendo = true;
    tentarRoubo(cpu, voce);
  }
  else {
    // BOLA SOLTA: corre para pegar
    if (distanciaBola > 20) {
      cpu.facing = bola.x > cpu.x ? 1 : -1;
      cpu.vx = cpu.facing * cpu.velocidade;
      cpu.movendo = true;
    } else {
      cpu.vx = 0;
      cpu.movendo = false;
    }
  }
}

/* ---------------- 9. FÍSICA E COLISÕES ---------------- */

// Atualiza timers e posição de um personagem
function atualizarPersonagem(p) {
  if (p.dribleCooldown > 0) p.dribleCooldown -= 1 / 60;
  if (p.dribleAtivo > 0)    p.dribleAtivo    -= 1 / 60;
  if (p.atordoado > 0)      p.atordoado      -= 1 / 60;

  // Desacelera o impulso do drible aos poucos
  if (p.dribleAtivo <= 0 && p.atordoado <= 0) {
    p.vx *= 0.8;
  } else if (p.atordoado > 0) {
    p.vx *= 0.85; // desliza caído e para devagar
  } else {
    p.vx *= 0.92;
  }

  p.x += p.vx;

  // Limites da quadra (impede sair pela lateral)
  if (p.x < 30)  p.x = 30;
  if (p.x > LARGURA - 30) p.x = LARGURA - 30;

  if (p.movendo) p.animacao += 0.25;
}

// Movimentação do jogador humano (lê o teclado)
function atualizarJogador() {
  if (voce.atordoado > 0) { voce.movendo = false; return; }

  let andando = false;

  if (teclas["KeyA"] || teclas["ArrowLeft"]) {
    voce.vx = -voce.velocidade;
    voce.facing = -1;
    andando = true;
  }
  if (teclas["KeyD"] || teclas["ArrowRight"]) {
    voce.vx = voce.velocidade;
    voce.facing = 1;
    andando = true;
  }
  if (!andando && voce.dribleAtivo <= 0) {
    voce.vx *= 0.8; // fricção ao soltar a tecla
  }
  if (andando) voce.movendo = true;
  else voce.movendo = false;
}

// Bola solta: gravidade, atrito e colisão com as bordas
function atualizarBolaSolta() {
  bola.vy += 0.45;              // gravidade
  bola.x += bola.vx;
  bola.y += bola.vy;

  // Chão: quica e perde energia
  if (bola.y + bola.raio >= CHAO_Y) {
    bola.y = CHAO_Y - bola.raio;
    bola.vy = -bola.vy * 0.6;
    bola.vx *= 0.92;            // atrito no chão
    if (Math.abs(bola.vy) < 1) bola.vy = 0;
  }

  // Teto
  if (bola.y - bola.raio <= 10) {
    bola.y = 10 + bola.raio;
    bola.vy = -bola.vy * 0.6;
  }

  // Paredes laterais (fora da boca do gol): a bola quica
  const dentroGol = bola.y > GOL_Y;
  if (!dentroGol) {
    if (bola.x - bola.raio <= 12) { bola.x = 12 + bola.raio; bola.vx = -bola.vx * 0.6; }
    if (bola.x + bola.raio >= LARGURA - 12) { bola.x = LARGURA - 12 - bola.raio; bola.vx = -bola.vx * 0.6; }
  } else {
    // Dentro da altura do gol: limita para não sumir muito
    if (bola.x < 0) bola.x = 0;
    if (bola.x > LARGURA) bola.x = LARGURA;
  }
}

// Bola com dono: acompanha o dono na frente dele
function atualizarBolaComDono() {
  const dono = bola.dono;
  bola.x = dono.x + dono.facing * 26;
  bola.y = CHAO_Y - 14;

  // Se um defensor chegar MUITO perto, pode carrinhar a bola para longe
  const adversario = dono === voce ? cpu : voce;
  if (Math.abs(adversario.x - dono.x) < 30 && Math.random() < 0.02) {
    bola.dono = null;
    bola.vx = adversario.facing * 7;
    bola.vy = -3;
    mostrarMensagem("CARRINHO! Bola solta!", "#ffd700");
  }
}

// Verifica se a bola entrou em um dos gols
function verificarGol() {
  // Gol do jogador: bola entra pela DIREITA
  if (bola.x > LARGURA - 8 && bola.y > GOL_Y) {
    jogo.golsVoce++;
    marcarGol("GOOOOL SEU! +1", "#39ff14");
  }
  // Gol da CPU: bola entra pela ESQUERDA
  if (bola.x < 8 && bola.y > GOL_Y) {
    jogo.golsCpu++;
    marcarGol("GOL DA CPU...", "#ff4757");
  }
}

function marcarGol(mensagem, cor) {
  atualizarPlacarNaTela();
  mostrarMensagem(mensagem, cor);
  jogo.tempoGol = 1.2;  // pausa breve de comemoração
  bola.dono = null;
}

/* ---------------- 10. CRONÔMETRO E FIM DE PARTIDA ---------------- */
let acumuladorTempo = 0;

function atualizarCronometro(deltaMs) {
  acumuladorTempo += deltaMs;
  // Atualiza o número na tela a cada segundo (1000 ms)
  if (acumuladorTempo >= 1000) {
    acumuladorTempo -= 1000;
    jogo.tempo--;
    elTimer.textContent = Math.max(0, jogo.tempo);
    if (jogo.tempo <= 10) elTimer.classList.add("urgente");
  }
}

function verificarFimDePartida() {
  // Vitória antecipada: primeiro a 3 gols
  if (jogo.golsVoce >= GOLS_PARA_VENCER) encerrarPartida("VITÓRIA!", "vitoria");
  else if (jogo.golsCpu >= GOLS_PARA_VENCER) encerrarPartida("DERROTA...", "derrota");
  else if (jogo.tempo <= 0) {
    if (jogo.golsVoce > jogo.golsCpu)      encerrarPartida("VITÓRIA!", "vitoria");
    else if (jogo.golsVoce < jogo.golsCpu) encerrarPartida("DERROTA...", "derrota");
    else                                   encerrarPartida("EMPATE!", "empate");
  }
}

function encerrarPartida(texto, classe) {
  jogo.rodando = false;
  textoResultado.textContent = texto;
  textoResultado.className = classe;
  textoPlacarFinal.textContent = jogo.golsVoce + " x " + jogo.golsCpu;
  telaResultado.classList.remove("escondida");
}

/* ---------------- 11. DESENHO ---------------- */

// Fundo: quadra de rua
function desenharCampo() {
  // Chão
  ctx.fillStyle = "#16301f";
  ctx.fillRect(0, CHAO_Y, LARGURA, ALTURA - CHAO_Y);

  // Linha do chão
  ctx.strokeStyle = "#2d5c3e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, CHAO_Y);
  ctx.lineTo(LARGURA, CHAO_Y);
  ctx.stroke();

  // Linha central
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = "rgba(57, 255, 20, 0.35)";
  ctx.beginPath();
  ctx.moveTo(LARGURA / 2, CHAO_Y);
  ctx.lineTo(LARGURA / 2, CHAO_Y - 160);
  ctx.stroke();
  ctx.setLineDash([]);

  // Círculo central
  ctx.beginPath();
  ctx.arc(LARGURA / 2, CHAO_Y, 60, Math.PI, 0);
  ctx.stroke();

  desenharGol(12, -1);   // gol esquerdo (da CPU)
  desenharGol(LARGURA - 12, 1); // gol direito (seu)

  // Detalhes urbanos: prédios silhouettes no fundo
  ctx.fillStyle = "#0d1a12";
  const predios = [
    [40, 140, 90, CHAO_Y - 140],
    [150, 90, 70, CHAO_Y - 90],
    [620, 110, 100, CHAO_Y - 110],
    [740, 70, 80, CHAO_Y - 70],
  ];
  for (const [px, py, pw, ph] of predios) {
    ctx.fillRect(px, py, pw, ph);
  }
}

function desenharGol(x, lado) {
  // Estrutura do gol: trave + rede simples
  ctx.strokeStyle = "#e8f5ee";
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (lado === -1) { // gol da esquerda
    ctx.moveTo(x, CHAO_Y);
    ctx.lineTo(x, GOL_Y);
    ctx.lineTo(x - 22, GOL_Y);
  } else {           // gol da direita
    ctx.moveTo(x, CHAO_Y);
    ctx.lineTo(x, GOL_Y);
    ctx.lineTo(x + 22, GOL_Y);
  }
  ctx.stroke();

  // Rede (linhas tracejadas finas)
  ctx.strokeStyle = "rgba(232,245,238,0.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const yy = GOL_Y + i * (GOL_ALTURA / 4);
    ctx.beginPath();
    if (lado === -1) { ctx.moveTo(x, yy); ctx.lineTo(x - 22, yy); }
    else { ctx.moveTo(x, yy); ctx.lineTo(x + 22, yy); }
    ctx.stroke();
  }
}

function desenharPersonagem(p) {
  const cimaY = p.y - p.altura; // topo da cabeça

  ctx.save();

  // Sombra no chão
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 2, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Se estiver atordoado, desenha deitado/abalado
  if (p.atordoado > 0) {
    ctx.fillStyle = p.cor;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 12, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Estrelinhas de tontura
    ctx.fillStyle = "#ffd700";
    ctx.font = "16px Arial";
    ctx.fillText("✶ ✶", p.x - 14, p.y - 30);
    ctx.restore();
    return;
  }

  // Pernas (animadas quando corre)
  const perna = Math.sin(p.animacao) * 8;
  ctx.strokeStyle = "#1c1c1c";
  ctx.lineWidth = 7;
  ctx.beginPath();
  if (p.movendo) {
    ctx.moveTo(p.x, p.y - 34);
    ctx.lineTo(p.x + perna, p.y);
    ctx.moveTo(p.x, p.y - 34);
    ctx.lineTo(p.x - perna, p.y);
  } else {
    ctx.moveTo(p.x, p.y - 34);
    ctx.lineTo(p.x - 7, p.y);
    ctx.moveTo(p.x, p.y - 34);
    ctx.lineTo(p.x + 7, p.y);
  }
  ctx.stroke();

  // Corpo (camisa)
  ctx.fillStyle = p.cor;
  ctx.fillRect(p.x - 14, p.y - 62, 28, 32);

  // Cabeça
  ctx.fillStyle = "#e8c39e";
  ctx.beginPath();
  ctx.arc(p.x, cimaY + 14, 13, 0, Math.PI * 2);
  ctx.fill();

  // Boné (detalhe street)
  ctx.fillStyle = p.cor;
  ctx.fillRect(p.x - 13, cimaY + 2, 26, 7);
  ctx.fillRect(p.x + (p.facing === 1 ? 4 : -20), cimaY + 7, 16, 4);

  ctx.restore();
}

function desenharBola() {
  // Sombra
  const alturaDoChao = CHAO_Y - bola.y;
  const tamanhoSombra = Math.max(4, 14 - alturaDoChao * 0.05);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(bola.x, CHAO_Y + 2, tamanhoSombra, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bola
  ctx.fillStyle = "#f5f5f5";
  ctx.beginPath();
  ctx.arc(bola.x, bola.y, bola.raio, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function desenharMensagens() {
  for (const m of jogo.mensagens) {
    ctx.save();
    ctx.globalAlpha = m.vida;
    ctx.fillStyle = m.cor;
    ctx.font = "900 30px 'Segoe UI', Arial";
    ctx.textAlign = "center";
    ctx.shadowColor = m.cor;
    ctx.shadowBlur = 18;
    ctx.fillText(m.texto, m.x, m.y);
    ctx.restore();
  }
}

function desenhar() {
  ctx.clearRect(0, 0, LARGURA, ALTURA);

  // Fundo
  ctx.fillStyle = "#12251a";
  ctx.fillRect(0, 0, LARGURA, ALTURA);

  desenharCampo();
  desenharPersonagem(cpu);
  desenharPersonagem(voce);
  desenharBola();
  desenharMensagens();
}

/* ---------------- 12. LOOP PRINCIPAL ---------------- */
let ultimoTempo = 0;

function loop(tempoAtual) {
  // deltaMs = quantos milissegundos passaram desde o último frame
  const deltaMs = tempoAtual - ultimoTempo;
  ultimoTempo = tempoAtual;

  if (jogo.rodando) {
    if (jogo.tempoGol > 0) {
      // Pausa de comemoração do gol: só conta o tempo e deixa a bola parada
      jogo.tempoGol -= deltaMs / 1000;
      if (jogo.tempoGol <= 0) reiniciarPosicoes();
    } else {
      atualizarCronometro(deltaMs);
      atualizarJogador();
      atualizarCpu();
      atualizarPersonagem(voce);
      atualizarPersonagem(cpu);

      if (bola.dono) atualizarBolaComDono();
      else atualizarBolaSolta();

      verificarGol();
      verificarFimDePartida();
    }

    // Atualiza mensagens flutuantes
    for (const m of jogo.mensagens) {
      m.y -= 0.6;
      m.vida -= 0.015;
    }
    jogo.mensagens = jogo.mensagens.filter((m) => m.vida > 0);
  }

  desenhar();
  requestAnimationFrame(loop); // chama o próximo frame
}

/* ---------------- 13. INICIALIZAÇÃO ---------------- */
document.getElementById("botaoComecar").addEventListener("click", iniciarPartida);
document.getElementById("botaoJogarNovamente").addEventListener("click", iniciarPartida);

reiniciarPosicoes();  // posição inicial na tela de menu
requestAnimationFrame(loop); // começa o loop (o menu fica parado sobre o campo)