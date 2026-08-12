# Integração LinkedIn Message Tracker → CRM United

O Tracker consulta o CRM United apenas por HTTP, com um segredo compartilhado.
Nenhuma chave administrativa do CRM fica no Tracker nem no navegador.

## 1. No projeto do CRM United (`lucaspj100/crmunited`)

1. Copie o arquivo `find-seller-by-email.ts` para
   `src/routes/api/public/find-seller-by-email.ts`.
2. Cadastre no CRM o secret `TRACKER_INTEGRATION_SECRET` com o mesmo valor
   usado no Tracker (`CRM_UNITED_API_SECRET`).
3. Publique o CRM.

O endpoint:

- aceita apenas `POST` com o header `x-tracker-secret`;
- normaliza o e-mail (`trim` + minúsculas);
- consulta `public.profiles` (`id`, `full_name`, `email`) e `public.user_roles`;
- devolve no máximo 5 correspondências com `id`, `name`, `email`, `role`;
- nunca devolve senhas, tokens ou dados comerciais.

## 2. No Tracker

Secrets necessários:

- `CRM_UNITED_API_URL` — URL publicada do CRM United (ex.: `https://seu-crm.lovable.app`)
- `CRM_UNITED_API_SECRET` — mesmo segredo configurado no CRM

Enquanto os secrets não existirem, o Tracker mostra o status
`🔴 Erro de integração` e o cadastro/login continua funcionando normalmente.
