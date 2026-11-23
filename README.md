# Império Digital

Espaço de trabalho privado para gestão da equipe, links, métricas e acessos.

## Rodar localmente

1. Instale Node.js 20 ou mais recente.
2. Configure as variáveis no `.env` a partir do `.env.example`.
3. Execute `npm start` e abra `http://localhost:3000`.

O acesso administrativo usa `ADMIN_USERNAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Mantenha o `.env` fora do Git e use uma senha aleatória forte antes de publicar.

## Banco de dados

- A aplicação usa PostgreSQL pelo servidor Node, com o estado privado no schema `equipe_digital_private` e RLS habilitado.
- Use `DATABASE_URL` para o servidor e `DIRECT_URL` para aplicar as migrações com `npm run db:migrate`.
- Para migrar o estado de um projeto Supabase antigo, mantenha temporariamente a conexão antiga em `SOURCE_DATABASE_URL`, configure o novo destino em `DIRECT_URL` e execute `npm run db:switch-project`. O processo recusa sobrescrever um destino que já contenha dados, revoga as sessões existentes e cria um backup local criptografado em `backups/`.
- O backup manual exporta perfis sem hashes de senha, links, pagamentos e histórico de acesso. Ele pode ser baixado na aba “Histórico de acessos”.
- As URLs e senhas do banco ficam somente em variáveis privadas do servidor. Esta aplicação não usa `SUPABASE_SECRET_KEY` ou chaves Supabase no navegador.
- O host direto `db.<projeto>.supabase.co` exige uma rede com IPv6. Se sua rede não tiver IPv6, use uma URI de pooler do Supabase compatível com a região do projeto.

## Contas e links

- Não existe cadastro público. A administração cria, ativa, desativa e redefine os acessos.
- As senhas são derivadas com `scrypt`; não são mostradas no painel nem incluídas no backup exportado.
- Membros não recebem saldo ou valor por link nas respostas da API. A administração consulta os valores individuais.
- Cada envio exige uma categoria e uma BM de 250 ou 2k. Os filtros separam categoria, limite, status e pessoa.
- Links pagos permanecem no banco e aparecem na opção de histórico arquivado. Reprovações antigas também permanecem registradas para consulta.
- O ranking pode ser consultado por dia, mês ou ano. O histórico administrativo registra IP, dispositivo e horário dos logins.

## Publicação

- Cadastre `DATABASE_URL`, `DIRECT_URL`, `ADMIN_NAME`, `ADMIN_USERNAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` nas variáveis privadas do ambiente de hospedagem.
- Aplique as migrações antes de colocar o servidor no ar. Não publique `.env`, outros arquivos de ambiente, arquivos de backup ou a pasta `data/`.
- O backend aplica proteção contra tentativas repetidas de login, cookies HTTP-only, validação CSRF, cabeçalhos de segurança e limites de entrada.
