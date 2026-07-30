import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import {
  Panel,
  buttonClass,
  inputClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/admin-ui";
import { inviteAthlete } from "@/lib/auth.functions";
import { supabase } from "@/lib/supabase/client";
import type {
  Achievement,
  Athlete,
  AthleteMedia,
  AthleteProfile,
  Country,
  Position,
  Sport,
} from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/athletes/$id")({ component: AthleteEditor });

function AthleteEditor() {
  const { id } = Route.useParams();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [profile, setProfile] = useState<Partial<AthleteProfile>>({});
  const [sports, setSports] = useState<Sport[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [media, setMedia] = useState<AthleteMedia[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  const load = useCallback(async () => {
    const [
      athleteResult,
      profileResult,
      sportsResult,
      positionsResult,
      countriesResult,
      mediaResult,
      achievementsResult,
    ] = await Promise.all([
      supabase.from("athletes").select("*").eq("id", id).single(),
      supabase.from("athlete_profiles").select("*").eq("athlete_id", id).maybeSingle(),
      supabase.from("sports").select("*").order("name_pt"),
      supabase.from("positions").select("*").order("name_pt"),
      supabase.from("countries").select("*").order("name_pt"),
      supabase
        .from("athlete_media")
        .select("*")
        .eq("athlete_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("achievements")
        .select("*")
        .eq("athlete_id", id)
        .order("achieved_on", { ascending: false }),
    ]);
    if (athleteResult.error) toast.error(athleteResult.error.message);
    else setAthlete(athleteResult.data as Athlete);
    setProfile((profileResult.data ?? { athlete_id: id }) as Partial<AthleteProfile>);
    setSports((sportsResult.data ?? []) as Sport[]);
    setPositions((positionsResult.data ?? []) as Position[]);
    setCountries((countriesResult.data ?? []) as Country[]);
    const loadedMedia = (mediaResult.data ?? []) as AthleteMedia[];
    setMedia(loadedMedia);
    const resolvedMedia = await Promise.all(
      loadedMedia.map(async (item) => {
        if (!item.url.startsWith("pending:")) return [item.id, item.url] as const;
        const { data: signed } = await supabase.storage
          .from("athlete-media-pending")
          .createSignedUrl(item.url.slice("pending:".length), 300);
        return [item.id, signed?.signedUrl ?? ""] as const;
      }),
    );
    setMediaUrls(Object.fromEntries(resolvedMedia));
    setAchievements((achievementsResult.data ?? []) as Achievement[]);
  }, [id]);
  useEffect(() => void load(), [load]);

  if (!athlete)
    return (
      <ProtectedPage role="agency_admin">
        <AppShell role="agency_admin" title="Atleta">
          <div>Carregando...</div>
        </AppShell>
      </ProtectedPage>
    );
  const currentAthlete = athlete;

  async function save() {
    const { error } = await supabase.from("athletes").update(currentAthlete).eq("id", id);
    if (error) return toast.error(error.message);
    const { error: profileError } = await supabase
      .from("athlete_profiles")
      .upsert({ ...profile, athlete_id: id });
    if (profileError) toast.error(profileError.message);
    else toast.success("Perfil salvo.");
  }
  async function invite() {
    if (!currentAthlete.email) return toast.error("Informe o e-mail do atleta.");
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (!accessToken) return toast.error("Sua sessão expirou. Entre novamente.");
      await inviteAthlete({
        data: { athleteId: id, email: currentAthlete.email, accessToken },
      });
      toast.success("Convite enviado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar convite.");
    }
  }
  async function archive() {
    const deleted_at = currentAthlete.deleted_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from("athletes")
      .update({ deleted_at, is_public: deleted_at ? false : currentAthlete.is_public })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      setAthlete({ ...currentAthlete, deleted_at });
      toast.success(deleted_at ? "Atleta arquivado." : "Atleta restaurado.");
    }
  }
  async function toggleMedia(item: AthleteMedia) {
    let nextUrl = item.url;
    if (!item.is_public && item.url.startsWith("pending:")) {
      const path = item.url.slice("pending:".length);
      const downloaded = await supabase.storage.from("athlete-media-pending").download(path);
      if (downloaded.error) return toast.error(downloaded.error.message);
      const uploaded = await supabase.storage.from("athlete-media").upload(path, downloaded.data, {
        upsert: true,
      });
      if (uploaded.error) return toast.error(uploaded.error.message);
      nextUrl = supabase.storage.from("athlete-media").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase
      .from("athlete_media")
      .update({ is_public: !item.is_public, url: nextUrl })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      if (!item.is_public && item.url.startsWith("pending:")) {
        await supabase.storage
          .from("athlete-media-pending")
          .remove([item.url.slice("pending:".length)]);
      }
      toast.success(item.is_public ? "Mídia ocultada." : "Mídia publicada.");
      await load();
    }
  }
  async function addAchievement() {
    const title = window.prompt("Título da conquista");
    if (!title) return;
    const { error } = await supabase
      .from("achievements")
      .insert({ athlete_id: id, title_pt: title, title_en: title, is_public: true });
    if (error) toast.error(error.message);
    else await load();
  }
  const update = <K extends keyof Athlete>(key: K, value: Athlete[K]) =>
    setAthlete({ ...athlete, [key]: value });

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title={athlete.full_name}>
        <div className="mb-6 flex flex-wrap gap-3">
          <button className={buttonClass} onClick={save}>
            Salvar alterações
          </button>
          <button className={secondaryButtonClass} onClick={invite}>
            Enviar convite
          </button>
          <button className={secondaryButtonClass} onClick={archive}>
            {athlete.deleted_at ? "Restaurar" : "Arquivar"}
          </button>
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Panel title="Dados do atleta">
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <Field label="Nome">
                  <input
                    className={inputClass}
                    value={athlete.full_name}
                    onChange={(e) => update("full_name", e.target.value)}
                  />
                </Field>
                <Field label="E-mail">
                  <input
                    className={inputClass}
                    type="email"
                    value={athlete.email ?? ""}
                    onChange={(e) => update("email", e.target.value || null)}
                  />
                </Field>
                <Field label="Slug">
                  <input
                    className={inputClass}
                    value={athlete.slug}
                    onChange={(e) => update("slug", e.target.value)}
                  />
                </Field>
                <Field label="Nascimento">
                  <input
                    className={inputClass}
                    type="date"
                    value={athlete.birth_date ?? ""}
                    onChange={(e) => update("birth_date", e.target.value || null)}
                  />
                </Field>
                <Field label="Esporte">
                  <select
                    className={inputClass}
                    value={athlete.sport_id ?? ""}
                    onChange={(e) => update("sport_id", e.target.value || null)}
                  >
                    <option value="">Selecione</option>
                    {sports.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name_pt}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Posição">
                  <select
                    className={inputClass}
                    value={athlete.position_id ?? ""}
                    onChange={(e) => update("position_id", e.target.value || null)}
                  >
                    <option value="">Selecione</option>
                    {positions
                      .filter((item) => !athlete.sport_id || item.sport_id === athlete.sport_id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name_pt}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Nacionalidade">
                  <select
                    className={inputClass}
                    value={athlete.nationality ?? ""}
                    onChange={(e) => update("nationality", e.target.value || null)}
                  >
                    <option value="">Selecione</option>
                    {countries.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.flag_emoji} {item.name_pt}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Altura (cm)">
                  <input
                    className={inputClass}
                    type="number"
                    value={athlete.height_cm ?? ""}
                    onChange={(e) =>
                      update("height_cm", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </Field>
                <Field label="Peso (kg)">
                  <input
                    className={inputClass}
                    type="number"
                    value={athlete.weight_kg ?? ""}
                    onChange={(e) =>
                      update("weight_kg", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </Field>
                <Field label="Foto URL">
                  <input
                    className={inputClass}
                    value={athlete.photo_url ?? ""}
                    onChange={(e) => update("photo_url", e.target.value || null)}
                  />
                </Field>
              </div>
            </Panel>
            <Panel title="Perfil público e acadêmico">
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <Field label="Biografia PT" wide>
                  <textarea
                    className={textareaClass}
                    value={profile.bio_pt ?? ""}
                    onChange={(e) => setProfile({ ...profile, bio_pt: e.target.value })}
                  />
                </Field>
                <Field label="Biografia EN" wide>
                  <textarea
                    className={textareaClass}
                    value={profile.bio_en ?? ""}
                    onChange={(e) => setProfile({ ...profile, bio_en: e.target.value })}
                  />
                </Field>
                <Field label="Ano de conclusão">
                  <input
                    className={inputClass}
                    type="number"
                    value={profile.graduation_year ?? ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        graduation_year: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </Field>
                <Field label="GPA">
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={profile.gpa ?? ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        gpa: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </Field>
                <Field label="Nível de inglês">
                  <input
                    className={inputClass}
                    value={profile.english_level ?? ""}
                    onChange={(e) => setProfile({ ...profile, english_level: e.target.value })}
                  />
                </Field>
                <Field label="Vídeo destaque">
                  <input
                    className={inputClass}
                    value={profile.highlight_video_url ?? ""}
                    onChange={(e) =>
                      setProfile({ ...profile, highlight_video_url: e.target.value })
                    }
                  />
                </Field>
              </div>
            </Panel>
            <Panel
              title="Mídia enviada"
              action={
                <button className={secondaryButtonClass} onClick={addAchievement}>
                  + Conquista
                </button>
              }
            >
              {media.length ? (
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  {media.map((item) => (
                    <article key={item.id}>
                      <div className="aspect-video overflow-hidden rounded-md bg-muted">
                        {item.kind === "photo" ? (
                          <img
                            src={mediaUrls[item.id] ?? ""}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <video
                            src={mediaUrls[item.id] ?? ""}
                            controls
                            className="h-full w-full"
                          />
                        )}
                      </div>
                      <button
                        className={secondaryButtonClass + " mt-2 w-full"}
                        onClick={() => toggleMedia(item)}
                      >
                        {item.is_public ? "Retirar do público" : "Aprovar e publicar"}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm text-muted-foreground">Nenhuma mídia enviada.</p>
              )}
              <div className="border-t p-5">
                <h3 className="font-medium">Conquistas publicadas</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {achievements.map((item) => (
                    <li key={item.id}>• {item.title_pt ?? item.title_en}</li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>
          <Panel title="Publicação">
            <div className="space-y-5 p-5">
              <label className="flex items-center justify-between gap-4">
                <span>
                  <b className="block text-sm">Perfil público</b>
                  <small className="text-muted-foreground">Aparece no catálogo</small>
                </span>
                <input
                  type="checkbox"
                  checked={athlete.is_public}
                  onChange={(e) => update("is_public", e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span>
                  <b className="block text-sm">Em destaque</b>
                  <small className="text-muted-foreground">Hero do catálogo</small>
                </span>
                <input
                  type="checkbox"
                  checked={athlete.is_featured}
                  onChange={(e) => update("is_featured", e.target.checked)}
                />
              </label>
              {athlete.is_public && (
                <a
                  href={`/athlete/${athlete.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className={secondaryButtonClass + " w-full"}
                >
                  Abrir perfil público
                </a>
              )}
            </div>
          </Panel>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm font-medium ${wide ? "md:col-span-2" : ""}`}>
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
