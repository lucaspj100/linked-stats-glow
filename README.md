# Sales Pulse

Crie um dashboard interno de vendas chamado "LinkedIn Message Tracker".

Contexto: uma extensão de navegador já envia eventos para uma tabela do

Supabase chamada "message_events", com as colunas:

- id (uuid)

- person_name (text) — nome do vendedor

- linkedin_account (text) — qual conta LinkedIn foi usada

- sent_at (timestamptz) — quando a mensagem foi enviada

- url (text)

- created_at (timestamptz)

Quero uma tela única com:

1. Cards no topo mostrando o total de mensagens enviadas HOJE, nos últimos

   7 dias e no mês atual (soma geral do time).

2. Um ranking por vendedor (person_name), com o total de mensagens enviadas

   hoje e nos últimos 7 dias, ordenado do maior para o menor.

3. Uma tabela expansível: ao clicar em um vendedor, mostrar o detalhamento

   por conta do LinkedIn (linkedin_account) daquele vendedor, com a

   contagem de mensagens de cada conta.

4. Um gráfico de linha simples mostrando o volume total de mensagens por

   dia nos últimos 14 dias.

5. Um filtro de período (hoje / últimos 7 dias / últimos 30 dias / período

   customizado).

6. Atualização em tempo real: quando um novo evento chegar na tabela

   message_events, os números devem atualizar automaticamente na tela,

   sem precisar recarregar a página (usar Supabase Realtime).

Use a tabela message_events que já existe no Supabase (não recrie, apenas

conecte). Design limpo, estilo painel de vendas B2B, cores neutras com um

destaque em azul.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://linked-stats-glow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/275e3dec-0801-4821-952e-33dbf781aafe).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
