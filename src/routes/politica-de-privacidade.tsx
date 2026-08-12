import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — LinkedIn Message Tracker" },
      {
        name: "description",
        content:
          "Política de Privacidade do LinkedIn Message Tracker. Saiba como os dados são coletados, utilizados e protegidos.",
      },
      { property: "og:title", content: "Política de Privacidade — LinkedIn Message Tracker" },
      {
        property: "og:description",
        content:
          "Política de Privacidade do LinkedIn Message Tracker. Saiba como os dados são coletados, utilizados e protegidos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-lg font-semibold tracking-tight text-foreground hover:text-primary">
            LinkedIn Message Tracker
          </Link>
          <Link
            to="/auth"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Acessar painel
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Política de Privacidade — LinkedIn Message Tracker
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: 12 de agosto de 2026
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
          <section>
            <p className="text-muted-foreground">
              O LinkedIn Message Tracker é uma extensão criada para registrar e contabilizar eventos de mensagens enviadas manualmente no LinkedIn, permitindo acompanhar métricas de produtividade comercial em um painel.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">1. Dados coletados</h2>
            <p className="mt-2 text-muted-foreground">
              A extensão pode tratar os seguintes dados necessários ao seu funcionamento:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Nome do vendedor configurado na extensão;</li>
              <li>Identificador da instalação da extensão;</li>
              <li>Token de autenticação da instalação;</li>
              <li>Identificador do evento registrado;</li>
              <li>Data e horário do envio registrado;</li>
              <li>URL da página do LinkedIn relacionada ao evento;</li>
              <li>Quantidade de mensagens contabilizadas.</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              A extensão não coleta, lê, armazena ou analisa o conteúdo das mensagens, conversas ou textos enviados pelo usuário no LinkedIn.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">2. Finalidade dos dados</h2>
            <p className="mt-2 text-muted-foreground">
              Os dados são utilizados exclusivamente para:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Registrar eventos de envio de mensagens;</li>
              <li>Contabilizar a quantidade de mensagens enviadas;</li>
              <li>Associar os registros ao vendedor correto;</li>
              <li>Exibir métricas de produtividade no painel LinkedIn Message Tracker;</li>
              <li>Manter o funcionamento e a segurança da extensão.</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Os dados não são utilizados para publicidade, criação de perfil comportamental, análise de conteúdo de conversas ou qualquer finalidade não relacionada ao funcionamento da extensão.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">3. Compartilhamento de dados</h2>
            <p className="mt-2 text-muted-foreground">
              O LinkedIn Message Tracker não vende dados pessoais. Os dados não são transferidos a terceiros para publicidade, análise de crédito ou finalidades não relacionadas ao funcionamento da extensão. Os dados podem ser processados pela infraestrutura utilizada para hospedar e operar o próprio sistema, exclusivamente para viabilizar as funcionalidades descritas nesta política.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">4. Armazenamento local</h2>
            <p className="mt-2 text-muted-foreground">
              A extensão utiliza o armazenamento local do navegador para guardar determinadas configurações e informações necessárias ao seu funcionamento, incluindo identificação da instalação, nome do vendedor e contadores locais.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">5. Segurança</h2>
            <p className="mt-2 text-muted-foreground">
              São adotadas medidas técnicas destinadas a limitar o acesso aos dados e permitir que os registros sejam enviados ao sistema de forma segura. A extensão não utiliza credenciais administrativas do banco de dados no navegador e não realiza gravações diretas no banco a partir do dispositivo do usuário.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">6. Permissões da extensão</h2>
            <p className="mt-2 text-muted-foreground">
              A extensão solicita apenas permissões necessárias ao seu funcionamento. A permissão de armazenamento é utilizada para salvar configurações e dados locais da extensão. A permissão de acesso ao domínio do sistema é utilizada exclusivamente para enviar os eventos contabilizados ao endpoint seguro do LinkedIn Message Tracker. A extensão também executa seus componentes nas páginas do LinkedIn necessárias para detectar eventos de envio de mensagens.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">7. Código remoto</h2>
            <p className="mt-2 text-muted-foreground">
              A extensão não executa código JavaScript ou WebAssembly hospedado remotamente. O código responsável pelo funcionamento da extensão está incluído no próprio pacote distribuído pela Chrome Web Store.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">8. Retenção e exclusão</h2>
            <p className="mt-2 text-muted-foreground">
              Os dados são mantidos somente pelo período necessário para o funcionamento e acompanhamento das métricas do sistema. Solicitações relacionadas a acesso, correção ou exclusão de dados poderão ser encaminhadas ao responsável pelo LinkedIn Message Tracker.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">9. Alterações nesta política</h2>
            <p className="mt-2 text-muted-foreground">
              Esta Política de Privacidade poderá ser atualizada caso ocorram mudanças nas funcionalidades da extensão, nos dados tratados ou em requisitos legais e das plataformas utilizadas. A data da atualização mais recente será sempre informada no início desta página.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">10. Contato</h2>
            <p className="mt-2 text-muted-foreground">
              Para dúvidas ou solicitações relacionadas à privacidade e ao tratamento de dados, entre em contato pelo e-mail oficial do responsável pelo LinkedIn Message Tracker.
            </p>
            <p className="mt-2 text-muted-foreground">
              E-mail: <a href="mailto:contato@linkedinmessagetracker.com" className="text-primary hover:underline">contato@linkedinmessagetracker.com</a>
            </p>
          </section>
        </div>
      </article>

      <footer className="border-t border-border bg-card py-6">
        <div className="mx-auto max-w-3xl px-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LinkedIn Message Tracker. Todos os direitos reservados.
        </div>
      </footer>
    </main>
  );
}
