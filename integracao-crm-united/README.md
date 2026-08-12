# Integração LinkedIn Message Tracker → CRM United (Funil Pro)

O Tracker fala com o CRM apenas por HTTP server-to-server, com um segredo
compartilhado. Nenhuma chave administrativa do CRM fica no Tracker nem no navegador.

## 1. Vínculo de vendedor por e-mail

1. Copie `find-seller-by-email.ts` para `src/routes/api/public/find-seller-by-email.ts` no CRM.
2. Cadastre no CRM o secret `TRACKER_INTEGRATION_SECRET` com o mesmo valor de
   `CRM_UNITED_API_SECRET` no Tracker.

O endpoint devolve no máximo 5 correspondências com `id`, `name`, `email`, `role`.

## 2. Atividades automáticas de LinkedIn — JÁ APLICADO NO CRM

No CRM (projeto Funil Pro) isso já está em produção:

- tabela `public.linkedin_message_events`
  (`vendedor_id`, `source`, `external_event_id`, `sent_at`, `installation_id`,
  `tracker_user_id`);
- índice único `(source, external_event_id)` → idempotência;
- Realtime habilitado na tabela;
- `productivity_summary` soma essas atividades ao `linkedins_checkout`;
- endpoint `src/routes/api/public/linkedin-message-event.ts` validando
  `x-tracker-secret` e devolvendo `{ success: true, duplicate: true }` em reenvios.

Por isso não há mais migration a aplicar aqui. Qualquer ajuste nessa parte deve
ser feito no próprio projeto do CRM.

### Pontuação

Nada de pontuação é gravado. `productivity_summary` continua devolvendo a
quantidade de LinkedIn, e `scoreOf` multiplica pelo peso atual de
`score_settings`. Trocar o peso no Painel ADM recalcula tudo retroativamente.

### Checkout do dia

O checkout manual não gera mais LinkedIn; o valor de `daily_checkouts.linkedin_msgs`
permanece para o histórico e é apenas somado. Novos eventos vêm exclusivamente de
`linkedin_message_events` com `source = 'linkedin_tracker'`, o que evita duplicidade
e preserva os registros manuais antigos.

## 3. Payload enviado pelo Tracker

```json
{
  "event_id": "uuid-do-evento",
  "crm_user_id": "uuid-do-vendedor-no-crm",
  "sent_at": "2026-08-12T17:30:00.000Z",
  "source": "linkedin_tracker",
  "installation_id": "uuid",
  "tracker_user_id": "uuid"
}
```

Nunca é enviado conteúdo de mensagem, conversa, token de instalação ou credenciais.

## 4. Secrets

- Tracker: `CRM_UNITED_API_URL`, `CRM_UNITED_API_SECRET`
- CRM: `TRACKER_INTEGRATION_SECRET`
