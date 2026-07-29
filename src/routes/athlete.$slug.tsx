import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, Award, GraduationCap, MapPin, Ruler, Weight } from "lucide-react";

import { getPublicAthlete } from "@/lib/athletes.functions";

export const Route = createFileRoute("/athlete/$slug")({
  loader: async ({ params }) => {
    const result = await getPublicAthlete({ data: { slug: params.slug } });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.athlete.full_name} — Go Team Go` },
          {
            name: "description",
            content: `${loaderData.athlete.full_name}, ${loaderData.athlete.sport?.name_pt ?? "atleta"} representado pela Go Team Go.`,
          },
          { property: "og:title", content: `${loaderData.athlete.full_name} — Go Team Go` },
          ...(loaderData.athlete.photo_url
            ? [{ property: "og:image", content: loaderData.athlete.photo_url }]
            : []),
        ]
      : [],
  }),
  component: PublicAthleteProfile,
});

function PublicAthleteProfile() {
  const { athlete, profile, media, achievements } = Route.useLoaderData();
  const stats =
    profile?.stats && typeof profile.stats === "object"
      ? Object.entries(profile.stats as Record<string, string | number>)
      : [];

  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="container-edge flex h-20 items-center justify-between">
          <Link to="/" className="font-display text-xl font-semibold">
            Go Team Go
          </Link>
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
          </Link>
        </div>
      </header>
      <section className="bg-surface text-surface-foreground">
        <div className="container-edge grid gap-10 py-14 lg:grid-cols-12 lg:py-20">
          <div className="lg:col-span-7 lg:self-end">
            <p className="eyebrow text-gold">{athlete.sport?.name_pt ?? "Atleta"}</p>
            <h1 className="mt-5 text-[clamp(3rem,7vw,6rem)] font-semibold leading-[0.94] tracking-[-0.045em]">
              {athlete.full_name}
            </h1>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65">
              {athlete.position?.name_pt && <span>{athlete.position.name_pt}</span>}
              {athlete.country?.name_pt && (
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> {athlete.country.flag_emoji}{" "}
                  {athlete.country.name_pt}
                </span>
              )}
            </div>
          </div>
          <div className="aspect-[4/5] overflow-hidden rounded-md bg-white/10 lg:col-span-5">
            {athlete.photo_url ? (
              <img src={athlete.photo_url} alt={athlete.full_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-7xl text-white/40">
                {athlete.full_name[0]}
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="container-edge grid gap-12 py-16 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="eyebrow text-primary">Sobre</p>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            {profile?.bio_pt ?? profile?.bio_en ?? "Perfil esportivo em preparação."}
          </p>
          {achievements.length > 0 && (
            <div className="mt-12">
              <h2 className="font-display text-2xl font-semibold">Conquistas</h2>
              <div className="mt-5 space-y-4">
                {achievements.map((item) => (
                  <article key={item.id} className="flex gap-4 border-t pt-4">
                    <Award className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-semibold">{item.title_pt ?? item.title_en}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.description_pt ?? item.description_en}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
        <aside className="lg:col-span-5">
          <div className="rounded-md border bg-card p-6">
            <p className="eyebrow text-muted-foreground">Perfil</p>
            <dl className="mt-5 grid grid-cols-2 gap-5">
              <Stat icon={Ruler} label="Altura" value={athlete.height_cm ? `${athlete.height_cm} cm` : "—"} />
              <Stat icon={Weight} label="Peso" value={athlete.weight_kg ? `${athlete.weight_kg} kg` : "—"} />
              <Stat icon={GraduationCap} label="Conclusão" value={profile?.graduation_year ?? "—"} />
              <Stat icon={GraduationCap} label="GPA" value={profile?.gpa ?? "—"} />
              {stats.map(([label, value]) => (
                <Stat key={label} icon={Award} label={label} value={value} />
              ))}
            </dl>
          </div>
        </aside>
      </section>
      {media.length > 0 && (
        <section className="bg-muted/50 py-16">
          <div className="container-edge">
            <h2 className="font-display text-3xl font-semibold">Galeria</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {media.map((item) =>
                item.kind === "video" ? (
                  <video key={item.id} controls poster={item.thumbnail_url ?? undefined} className="aspect-video w-full rounded-md bg-black">
                    <source src={item.url} />
                  </video>
                ) : (
                  <img key={item.id} src={item.url} alt={item.caption_pt ?? athlete.full_name} className="aspect-[4/3] w-full rounded-md object-cover" />
                ),
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Award;
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </dt>
      <dd className="mt-1 font-display text-xl font-semibold">{value}</dd>
    </div>
  );
}
