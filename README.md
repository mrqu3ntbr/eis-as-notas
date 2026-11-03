# Eis as Notas — app de desktop (Mac e Windows)

Este projeto empacota o aplicativo `index.html` num programa de desktop (Electron).
Os dados ficam em um arquivo no seu computador, sem login e sem internet.

> **Aviso honesto:** o código foi escrito e testado em partes (armazenamento em arquivo e adaptação da página),
> mas a janela do Electron e a geração dos instaladores só podem ser verificadas ao rodar o passo a passo abaixo.
> Se algo falhar na primeira vez, copie a mensagem de erro e peça ajuda: costuma ser um ajuste pequeno.

---

## 1. Gerar os instaladores (Mac e Windows) sem precisar de um Mac

O GitHub monta os dois instaladores na nuvem. Você precisa de uma conta gratuita em https://github.com.

1. **Crie um repositório novo** (botão **New**). Nome sugerido: `eis-as-notas`. Deixe como **Private** (privado).
2. **Envie esta pasta para o repositório.** O jeito mais simples é o **GitHub Desktop** (https://desktop.github.com):
   *File → Add local repository…* → escolha esta pasta → *Publish repository* (mantenha “Keep this code private”).
   Pelo Terminal também funciona:
   ```
   cd eis-as-notas-app
   git init
   git add .
   git commit -m "Primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/eis-as-notas.git
   git push -u origin main
   ```
   (A pasta oculta `.github` precisa ir junto; por isso não use “arrastar arquivos” pelo site.)
3. No GitHub, abra a aba **Actions** → **Gerar instaladores** → **Run workflow**.
4. Aguarde uns 5 a 15 minutos. Ao terminar, abra a execução e baixe, em **Artifacts**:
   - `instalador-macos-latest` → arquivo `.dmg` (Mac)
   - `instalador-windows-latest` → arquivo `.exe` (Windows)
5. (Opcional) Para publicar numa página de downloads, crie uma versão: `git tag v1.0.0` e `git push origin v1.0.0`.
   Os instaladores aparecem na aba **Releases**.

## 2. Instalar

**Mac:** abra o `.dmg` e arraste **Eis as Notas** para **Aplicativos**.
Como o app não é assinado pela Apple, na primeira vez o macOS pode bloquear:
- clique com o botão direito no app → **Abrir** → **Abrir**; ou
- se aparecer “está danificado”, abra o Terminal e rode:
  `xattr -cr "/Applications/Eis as Notas.app"`

**Windows:** dê duplo clique no instalador `.exe`. Se aparecer o aviso azul do SmartScreen,
clique em **Mais informações → Executar assim mesmo**.

*(Assinar o app para eliminar esses avisos exige conta de desenvolvedor paga na Apple e certificado no Windows; para uso pessoal não é necessário.)*

## 3. Onde ficam os dados

| Sistema | Pasta |
|---|---|
| Mac | `~/Library/Application Support/Eis as Notas/` |
| Windows | `%APPDATA%\Eis as Notas\` |

- `eis-as-notas.json` — todos os dados (notas, calendários, pilotos, equipes, imagens que você enviou).
- `eis-as-notas.json.bak` — cópia da gravação anterior (usada automaticamente se o arquivo principal for corrompido).
- `backups/` — um snapshot por dia, com os 14 mais recentes.

No app: **Arquivo → Abrir pasta dos dados**. Desinstalar o programa **não** apaga essa pasta.
Para levar os dados a outro computador: **Arquivo → Salvar backup** e, no outro, **Arquivo → Restaurar backup**.

## Backup automático na nuvem

O app não fala com nenhum serviço de nuvem por conta própria (continua 100% offline). Em vez disso, ele grava cópias de segurança numa pasta que **você escolhe**, e o iCloud Drive, OneDrive, Google Drive ou Dropbox enviam essa pasta para a nuvem.

**Como ligar**
1. Crie uma pasta dentro do seu serviço de nuvem, por exemplo `iCloud Drive/Eis as Notas Backup`.
2. No app, clique na caixa **Backup automático desligado** (canto inferior da barra lateral) ou use **Arquivo → Escolher pasta de backup automático…** e selecione a pasta.

**O que acontece**
- Cerca de 20 segundos depois de qualquer alteração, e também ao abrir e ao fechar o app, são gravados:
  - `Eis as Notas - backup mais recente.json`
  - uma cópia por dia, `Eis as Notas - backup AAAA-MM-DD.json` (as últimas 30 são mantidas)
- A caixa na barra lateral mostra: **Backup em dia** (verde), **Salvando backup…**, **Backup pendente** (amarelo: alterações há mais de 10 minutos sem copiar) ou **Backup com problema** (vermelho: pasta sumiu, sem permissão ou sem espaço). Com problema, o app tenta de novo a cada 5 minutos sozinho.

**Restaurar (computador novo ou dados perdidos)**: instale o app, abra **Arquivo → Restaurar backup…** e escolha `backup mais recente.json` na pasta da nuvem.

**Atenção**: não coloque a pasta de dados do app (a de “Abrir pasta dos dados”) dentro da nuvem; sincronizar o arquivo em uso por dois computadores pode gerar conflitos. Use apenas a pasta de backup.

## Resultados pela internet

O botão **⟳ Buscar resultado** (aba Notas) e a busca automática usam duas fontes públicas, nesta ordem: **OpenF1** (api.openf1.org, mais rápida) e, se ela falhar ou ainda não tiver a corrida, **Jolpica/Ergast** (api.jolpi.ca). A classificação de construtores vem da Jolpica. Sem internet, o app continua funcionando normalmente com a ordem que já estiver salva ou digitada.

## Segurança da restauração de backups

Ao restaurar um backup (Arquivo → Restaurar backup, ou o botão da barra lateral), o app **valida tudo antes de mexer nos seus dados**:
estrutura e tipos, limites de tamanho, IDs únicos e válidos, referências entre pilotos, equipes e corridas, notas (número de -10 a 10 ou vazio), cores `#RRGGBB`, datas reais e imagens (somente PNG, JPEG ou WebP embutidas, com o conteúdo conferido; links externos e SVG são recusados).
Backups de versões anteriores continuam sendo aceitos e convertidos. Se algo estiver errado, o app mostra "Backup inválido", lista os problemas e **não altera nenhum dado**.
Os textos continuam sendo escapados na tela, e cores, imagens e IDs são checados de novo na hora de desenhar a página.

Os testes (`npm test`) cobrem backups válidos, antigos (em `test/fixtures`), malformados e com tentativas de injeção.

## 4. Trazer os dados que você já tem (do arquivo HTML)

1. No `eis-as-notas.html` que você usa hoje, clique em **Salvar backup**.
2. Instale e abra o app.
3. **Arquivo → Restaurar backup…** e escolha o arquivo salvo.

## 5. Atualizar o app

Troque o `index.html` por uma versão nova (ou peça a mim a nova versão), envie ao GitHub e rode o passo 1.3 de novo.
Seus dados não são afetados: ficam fora do programa.

## 6. Rodar no seu computador sem gerar instalador (opcional)

Instale o Node.js (versão LTS) e, nesta pasta:
```
npm install
npm start      # abre o app
npm test       # testa o armazenamento em arquivo
npm run dist   # gera o instalador do seu próprio sistema, na pasta dist/
```
As versões do Electron (`^37`) e do electron-builder (`^26`) estão no `package.json`.
Para atualizar: `npm install electron@latest electron-builder@latest`.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | O aplicativo (a mesma página, usando o arquivo de dados quando está no Electron) |
| `main.js` | Abre a janela, o menu em português e grava/lê o arquivo de dados |
| `preload.js` | Ponte segura entre a página e o arquivo de dados |
| `backup.js` | Backup automático para a pasta da nuvem escolhida (cópia mais recente + 1 por dia, aviso de falha) |
| `storage.js` | Gravação segura em arquivo (temporário → renomeia), cópia `.bak` e snapshots diários |
| `build/icon.png` | Ícone (logo GP), usado para gerar `.icns` e `.ico` |
| `.github/workflows/build.yml` | Gera o `.dmg` e o `.exe` no GitHub |
