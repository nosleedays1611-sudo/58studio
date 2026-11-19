# ILOVEBR58 Studio — projeto independente

Site administrativo separado da loja. **Não contém banco de dados, nem fotos de clientes.**

## Interface em um único HTML

**Toda a interface está em `public/index.html`: login, painel, CSS dentro de `<style>` e JavaScript dentro de `<script>`.** Não existem arquivos `public/login.html`, `public/css/*.css` ou `public/js/*.js`. É normal que as imagens da identidade visual fiquem em `public/assets/` e que o `server.js` continue separado: ele é obrigatório para autenticação, cookies HttpOnly, autorização, conexão com a loja e para evitar exposição de credenciais.

O navegador abre `/login` sem sessão e `/` com sessão, mas ambos usam **o mesmo HTML**. A política CSP autoriza apenas o JavaScript inline deste documento por nonce individual a cada resposta. As senhas e o segredo continuam exclusivamente nas variáveis da hospedagem.

- URL prevista: `https://studio.ilovebr58.xyz`
- Loja: `https://ilovebr58.xyz`
- Painel: login próprio por usuário/senha via variáveis de ambiente, sessão HttpOnly e CSRF.
- Funcionalidades: produtos, fotos, categorias e marcas, identidade e banners, cupons, clientes, pedidos, frete fixo, rastreio, exportação CSV, histórico.
- Créditos na tela de entrada: **Desenvolvido por: seu filho kk**.

## Instalação na ShardCloud

**1. Loja atual** — aplique primeiro os arquivos do pacote `ILOVEBR58-LOJA-CONEXAO-STUDIO.zip` na hospedagem da loja, sem apagar `.env`, o banco SQLite ou uploads. Faça backup antes. Defina `STUDIO_SHARED_SECRET` no ambiente da loja; nunca no HTML. O backend da loja precisa conter `src/admin-api.js` e migrações de `src/db.js` do pacote. Reimplante/reinicie.

**2. Studio** — crie um projeto/repositório **separado** (por exemplo `ilovebr58-studio`) usando **apenas os arquivos deste ZIP**. Na ShardCloud crie novo serviço Node com `npm start` e configure as variáveis:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `STUDIO_URL` | `https://studio.ilovebr58.xyz` (somente depois de configurar DNS/HTTPS) |
| `STORE_API_URL` | `https://ilovebr58.xyz` (ou URL real da loja) |
| `ADMIN_USERNAME` | Usuário que você escolher, sem espaços |
| `ADMIN_PASSWORD` | Senha forte, >=12 caracteres |
| `STUDIO_SHARED_SECRET` | Mesmo segredo aleatório de >=32 caracteres configurado na loja |
| `PORT` | Atribuído pela ShardCloud, se ela fornecer |

Para gerar um segredo aleatório no terminal: `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Copie a saída como valor de `STUDIO_SHARED_SECRET` **nos dois serviços**. Não comite no GitHub.

**3. DNS** — aponte `studio.ilovebr58.xyz` ao novo serviço e ative SSL/HTTPS. Enquanto usar URL temporária de hospedagem, configure `STUDIO_URL` igual a essa origem (sem caminho). A loja deve ter `APP_URL` configurado com sua origem correta.

**4. Entrar** — abra `studio.ilovebr58.xyz/login` e faça login com usuário e senha do ambiente. **Não precisa cadastrar uma conta de cliente na loja**, nem promover usuários com `admin:create`.

## Fluxo de fotos e dados

Fotos são enviadas pelo navegador ao **servidor do Studio**, autenticado e com proteção CSRF. O servidor as envia à **API protegida da loja** usando a chave privada compartilhada. O banco e os arquivos ficam na loja, com `MEDIA_DIR` em armazenamento persistente. O endereço de foto `/media/xxx.webp` é público na loja para ser exibido nos produtos, e é acessível no Studio via proxy para prévias. **Nenhum segredo é enviado ao JavaScript ou gravado no GitHub.**

## Limites e verificações

- O Studio é funcional, mas requer que **ambas** as hospedagens estejam configuradas com os mesmos segredos e tenham conectividade HTTP(S).
- Teste editar um produto e reenviar fotos após reiniciar os serviços. Sem armazenamento persistente na loja, uploads podem se perder.
- Antes de habilitar vendas reais, teste pagamento Mercado Pago, frete, estoque e notificações em ambiente de testes.
- Frete automático, etiquetas, notas fiscais e devoluções automáticas não estão implementados. O painel permite alterar status e rastreio manualmente.
- Credenciais de admin são únicas no ambiente; sem suporte a múltiplos operadores ou autenticação de dois fatores nesta versão.

## Rodar localmente

1. Inicie a **loja**, com a API atualizada, na porta 3000 e `STUDIO_SHARED_SECRET` configurado.
2. No Studio copie `.env.example` para `.env`, preencha usuário, senha e o mesmo segredo, e rode `npm start`.
3. Abra `http://localhost:3100/login`. Testes: `npm test`.
