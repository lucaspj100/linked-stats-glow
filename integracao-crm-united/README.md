# Integração LinkedIn Message Tracker → CRM United

O Tracker fala com o CRM United apenas por HTTP server-to-server, com um segredo
compartilhado. Nenhuma chave administrativa do CRM fica no Tracker nem no navegador.

## 1. Vínculo de vendedor por e-mail (já em produção)

1. Copie `find-seller-by-email.ts` para `src/routes/api/public/find-seller-by-email.ts` no CRM.
2. Cadastre no CRM o secret `TRACKER_INTEGRATION_SECRET` com o mesmo valor de
   `CRM_UNITED_API_SECRET` no Tracker.

O endpoint devolve no máximo 5 correspondências com `id`, `name`, `email`, `role`.

## 2. Atividades automáticas de LinkedIn (novo)

No projeto do CRM United:

1. Aplique a migration `linkedin-tracker-events.sql`. Ela:
   - cria `public.linkedin_tracker_events` (`vendedor_id`, `source`, `external_event_id`,
     `sent_at`, `installation_id`, `tracker_user_id`);
   - cria índice único `(source, external_event_id)` → idempotência;
   - habilita Realtime na tabela;
   - atualiza `productivity_summary` para somar essas atividades ao valor já
     existente de `linkedins_checkout`, usando `sent_at` convertido para
     `America/Sao_Paulo` (mesmo fuso dos demais indicadores do Telão).
2. Copie `linkedin-message-event.ts` para
   `src/routes/api/public/linkedin-message-event.ts`.
3. No Telão (`src/routes/_authenticated/placar-diario.tsx`), adicione a nova tabela
   ao canal Realtime já existente, junto de `prospect_attempts`:

   ```ts
   .on("postgres_changes", { event: "INSERT", schema: "public", table: "linkedin_tracker_events" }, () => {
     void (async () => {
       const { data } = await supabase.rpc("productivity_summary" as never, {
         _start: range.start, _end: range.end, _vendedor_id: null, _team_id: teamId,
       } as never);
       if (Array.isArray(data)) setLive(data as unknown as ProductivityRow[]);
     })();
   })
   ```

4. Publique o CRM.

### Pontuação

Nada de pontuação é gravado. `productivity_summary` continua devolvendo a
quantidade de LinkedIn, e `scoreOf` multiplica pelo peso atual de
`score_settings`. Trocar o peso no Painel ADM recalcula tudo retroativamente.

### Checkout do dia

O checkout manual não gera mais LinkedIn; o valor de `daily_checkouts.linkedin_msgs`
permanece para o histórico e é apenas somado. Novos eventos vêm exclusivamente de
`linkedin_tracker_events` com `source = 'linkedin_tracker'`, o que evita duplicidade
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
