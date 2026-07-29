import { Database, ExternalLink, ShieldCheck } from "lucide-react";

export function ConfigurationNotice() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container-edge flex h-20 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-semibold tracking-tight">Go Team Go</span>
            <span className="h-1 w-1 rounded-full bg-gold" aria-hidden="true" />
            <span className="eyebrow text-muted-foreground">Athlete Platform</span>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            Ambiente local
          </span>
        </div>
      </header>

      <section className="container-edge grid min-h-[calc(100vh-5rem)] items-center gap-12 py-16 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="eyebrow text-primary">Configuração necessária</p>
          <h1 className="mt-6 max-w-3xl text-[clamp(2.6rem,6vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.045em]">
            A base está pronta para receber os atletas.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Conecte o Supabase externo para ativar autenticação, catálogo, pipeline e uploads.
            Nenhum recurso do Lovable Cloud é utilizado.
          </p>
          <a
            className="mt-9 inline-flex h-12 items-center gap-2 rounded-md bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-90"
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            Abrir Supabase
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <div className="overflow-hidden rounded-md bg-surface text-surface-foreground lg:col-span-5">
          <div className="border-b border-white/10 p-6">
            <p className="eyebrow text-gold">Checklist do ambiente</p>
          </div>
          <ol className="divide-y divide-white/10">
            {[
              {
                icon: Database,
                title: "Criar o projeto externo",
                text: "Aplique as migrations versionadas em db/migrations.",
              },
              {
                icon: ShieldCheck,
                title: "Cadastrar as variáveis",
                text: "Copie .env.example para .env e preencha as chaves.",
              },
              {
                icon: ExternalLink,
                title: "Reiniciar a aplicação",
                text: "O catálogo será habilitado automaticamente.",
              },
            ].map(({ icon: Icon, title, text }, index) => (
              <li className="flex gap-4 p-6" key={title}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <span className="font-display text-xs text-gold">0{index + 1}</span>
                  <h2 className="mt-1 font-display text-lg font-semibold">{title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
