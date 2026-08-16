import { createFileRoute } from "@tanstack/react-router";
import { Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { AthleteAccessCard } from "@/components/athlete-access-card";
import { SearchableSelect } from "@/components/searchable-select";
import { StageTimeline } from "@/components/stage-timeline";
import {
  Panel,
  buttonClass,
  inputClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/admin-ui";
import { inviteAthlete } from "@/lib/auth.functions";
import { buildAthleteSlug } from "@/lib/athlete-slugs";
import { buildStageProgressPayload } from "@/lib/pipeline.helpers";
import { supabase } from "@/lib/supabase/client";
import { validateUpload } from "@/lib/uploads";
import { isValidYoutubeUrl, youtubeThumbnail } from "@/lib/youtube";
import type {
  Achievement,
  Athlete,
  AthleteStageProgress,
  AthleteMedia,
  AthleteProfile,
  AthleteVideo,
  AthleteVideoKind,
  ChecklistItem,
  Country,
  PipelineStage,
  Position,
  Sport,
} from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/athletes/$id")({
  component: AthleteEditor,
});

function AthleteEditor() {
  const { id } = Route.useParams();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [profile, setProfile] = useState<Partial<AthleteProfile>>({});
  const [sports, setSports] = useState<Sport[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stageProgress, setStageProgress] = useState<AthleteStageProgress[]>([]);
  const [checklistDefinitions, setChecklistDefinitions] = useState<ChecklistItem[]>([]);
  const [media, setMedia] = useState<AthleteMedia[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [achievementDraft, setAchievementDraft] = useState({
    title: "",
    description: "",
    achievedOn: "",
    imageUrl: "",
    medal: false,
    type: "",
  });
  const [showAchievementForm, setShowAchievementForm] = useState(false);
  const [videos, setVideos] = useState<AthleteVideo[]>([]);
  const [videoDraft, setVideoDraft] = useState<{
    kind: AthleteVideoKind;
    youtube_url: string;
    title: string;
  }>({ kind: "highlight", title: "", youtube_url: "" });
  const [uploadingAchievementImage, setUploadingAchievementImage] = useState(false);
  const [tab, setTab] = useState<"timeline" | "data" | "profile">("timeline");

  const load = useCallback(async () => {
    const [
      athleteResult,
      profileResult,
      sportsResult,
      positionsResult,
      countriesResult,
      stagesResult,
      progressResult,
      checklistResult,
      mediaResult,
      achievementsResult,
      videosResult,
    ] = await Promise.all([
      supabase.from("athletes").select("*").eq("id", id).single(),
      supabase.from("athlete_profiles").select("*").eq("athlete_id", id).maybeSingle(),
      supabase.from("sports").select("*").order("name_pt"),
      supabase.from("positions").select("*").order("name_pt"),
      supabase.from("countries").select("*").order("name_pt"),
      supabase.from("pipeline_stages").select("*").eq("is_active", true).order("order_index"),
      supabase.from("athlete_stage_progress").select("*").eq("athlete_id", id),
      supabase.from("checklist_items").select("*").order("sort_order"),
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
      supabase
        .from("athlete_videos")
        .select("*")
        .eq("athlete_id", id)
        .order("sort_order", { ascending: true }),
    ]);
    if (athleteResult.error) toast.error(athleteResult.error.message);
    else setAthlete(athleteResult.data as Athlete);
    setProfile((profileResult.data ?? { athlete_id: id }) as Partial<AthleteProfile>);
    setSports((sportsResult.data ?? []) as Sport[]);
    setPositions((positionsResult.data ?? []) as Position[]);
    setCountries((countriesResult.data ?? []) as Country[]);
    setStages((stagesResult.data ?? []) as PipelineStage[]);
    setStageProgress((progressResult.data ?? []) as AthleteStageProgress[]);
    setChecklistDefinitions((checklistResult.data ?? []) as ChecklistItem[]);
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
    if (videosResult.error) toast.error(`Erro ao carregar vídeos: ${videosResult.error.message}`);
    setVideos((videosResult.data ?? []) as AthleteVideo[]);
  }, [id]);
  useEffect(() => void load(), [load]);

  const filteredCountries = useMemo(() => {
    const term = countrySearch.trim().toLowerCase();
    if (!term) return countries;
    return countries.filter((item) =>
      [item.name_pt, item.name_en, item.code].some((value) => value?.toLowerCase().includes(term)),
    );
  }, [countries, countrySearch]);

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
    const { data: existing } = await supabase.from("athletes").select("slug").neq("id", id);
    const existingSlugs = (existing ?? []).map((item) => item.slug as string);
    const nextSlug = buildAthleteSlug(
      currentAthlete.full_name,
      positions.find((item) => item.id === currentAthlete.position_id)?.name_pt,
      existingSlugs,
    );
    const { error } = await supabase
      .from("athletes")
      .update({ ...currentAthlete, slug: nextSlug })
      .eq("id", id);
    if (error) return toast.error(error.message);
    if (currentAthlete.current_stage_id) {
      const { data: existingProgress } = await supabase
        .from("athlete_stage_progress")
        .select("*")
        .eq("athlete_id", id)
        .eq("stage_id", currentAthlete.current_stage_id)
        .maybeSingle();
      const { error: progressError } = await supabase.from("athlete_stage_progress").upsert(
        buildStageProgressPayload({
          athleteId: id,
          existing: existingProgress,
          stageId: currentAthlete.current_stage_id,
        }),
        { onConflict: "athlete_id,stage_id" },
      );
      if (progressError) return toast.error(progressError.message);
    }
    const { error: profileError } = await supabase
      .from("athlete_profiles")
      .upsert({ ...profile, athlete_id: id });
    if (profileError) toast.error(profileError.message);

    if (videoDraft.youtube_url && isValidYoutubeUrl(videoDraft.youtube_url)) {
      await addVideo();
    }

    if (!profileError) toast.success("Perfil salvo.");
  }
  async function invite() {
    if (!currentAthlete.email) return toast.error("Informe o e-mail do atleta.");
    try {
      await inviteAthlete({ data: { athleteId: id, email: currentAthlete.email } });
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
  async function uploadPhoto(file?: File) {
    if (!file || !currentAthlete) return;
    const validation = validateUpload("photo", file);
    if (!validation.valid) return toast.error("Arquivo inválido ou acima do limite.");
    setUploadingPhoto(true);
    const path = `${currentAthlete.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const stored = await supabase.storage
      .from("athlete-media")
      .upload(path, file, { upsert: true });
    if (stored.error) toast.error(stored.error.message);
    else {
      const publicUrl = supabase.storage.from("athlete-media").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase
        .from("athletes")
        .update({ photo_url: publicUrl })
        .eq("id", id);
      if (error) toast.error(error.message);
      else {
        setAthlete({ ...currentAthlete, photo_url: publicUrl });
        toast.success("Foto enviada.");
      }
    }
    setUploadingPhoto(false);
  }

  async function uploadHighlightVideo(file?: File) {
    if (!file || !currentAthlete) return;
    const validation = validateUpload("video", file);
    if (!validation.valid) return toast.error("Vídeo inválido ou acima do limite.");
    setUploadingVideo(true);
    const path = `${currentAthlete.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const stored = await supabase.storage
      .from("athlete-media")
      .upload(path, file, { upsert: true });
    if (stored.error) toast.error(stored.error.message);
    else {
      const publicUrl = supabase.storage.from("athlete-media").getPublicUrl(path).data.publicUrl;
      setProfile({ ...profile, highlight_video_url: publicUrl });
      toast.success("Vídeo enviado.");
    }
    setUploadingVideo(false);
  }

  async function saveAchievement() {
    if (!achievementDraft.title.trim()) return toast.error("Informe um título para a conquista.");
    const { error } = await supabase.from("achievements").insert({
      athlete_id: id,
      title_pt: achievementDraft.title,
      title_en: achievementDraft.title,
      description_pt: achievementDraft.description || null,
      description_en: achievementDraft.description || null,
      achieved_on: achievementDraft.achievedOn || null,
      image_url: achievementDraft.imageUrl || null,
      medal: achievementDraft.medal,
      achievement_type: achievementDraft.type || null,
      is_public: true,
    });
    if (error) toast.error(error.message);
    else {
      setAchievementDraft({
        title: "",
        description: "",
        achievedOn: "",
        imageUrl: "",
        medal: false,
        type: "",
      });
      setShowAchievementForm(false);
      await load();
    }
  }

  async function addVideo(overrideDraft?: {
    kind: AthleteVideoKind;
    youtube_url: string;
    title?: string | null;
  }) {
    const draft = overrideDraft || videoDraft;
    if (!isValidYoutubeUrl(draft.youtube_url))
      return toast.error("Informe um link válido do YouTube.");

    // Se for 'feature' ou 'presentation', e já existir um do mesmo tipo, atualiza/substitui
    const existingSameKind = videos.find((item) => item.kind === draft.kind);
    if ((draft.kind === "feature" || draft.kind === "presentation") && existingSameKind) {
      const { error } = await supabase
        .from("athlete_videos")
        .update({
          youtube_url: draft.youtube_url.trim(),
          title: draft.title || null,
        })
        .eq("id", existingSameKind.id);
      if (error) return toast.error(error.message);
      toast.success(
        draft.kind === "feature"
          ? "Vídeo de destaque atualizado."
          : "Vídeo de apresentação atualizado.",
      );
    } else {
      const sameKindCount = videos.filter((item) => item.kind === draft.kind).length;
      const { error } = await supabase.from("athlete_videos").insert({
        athlete_id: id,
        kind: draft.kind,
        youtube_url: draft.youtube_url.trim(),
        title: draft.title || null,
        sort_order: sameKindCount,
      });
      if (error) return toast.error(error.message);
      toast.success("Vídeo salvo com sucesso.");
    }

    if (!overrideDraft) {
      setVideoDraft({ kind: videoDraft.kind, title: "", youtube_url: "" });
    }
    await load();
  }

  async function deleteVideo(item: AthleteVideo) {
    const { error } = await supabase.from("athlete_videos").delete().eq("id", item.id);
    if (error) toast.error(error.message);
    else await load();
  }

  async function uploadAchievementImage(file?: File) {
    if (!file || !currentAthlete) return;
    const validation = validateUpload("photo", file);
    if (!validation.valid) return toast.error("Imagem inválida ou acima do limite.");
    setUploadingAchievementImage(true);
    const path = `${currentAthlete.id}/achievements/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const stored = await supabase.storage
      .from("athlete-media")
      .upload(path, file, { upsert: true });
    if (stored.error) toast.error(stored.error.message);
    else {
      const publicUrl = supabase.storage.from("athlete-media").getPublicUrl(path).data.publicUrl;
      setAchievementDraft((draft) => ({ ...draft, imageUrl: publicUrl }));
      toast.success("Imagem da conquista enviada.");
    }
    setUploadingAchievementImage(false);
  }

  async function deleteAchievement(item: Achievement) {
    const { error } = await supabase.from("achievements").delete().eq("id", item.id);
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
        <div
          role="tablist"
          aria-label="Seções do atleta"
          className="mb-6 flex w-full gap-1 overflow-x-auto rounded-md border border-border/70 bg-background/60 p-1"
        >
          {(
            [
              ["timeline", "Timeline"],
              ["data", "Dados do atleta"],
              ["profile", "Perfil & mídia"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`flex-1 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            {tab === "timeline" && (
              <Panel
                title="Jornada do atleta"
                description="Acompanhe e atualize as fases do pipeline."
              >
                <div className="p-5">
                  <StageTimeline
                    athleteId={athlete.id}
                    stages={stages}
                    progress={stageProgress}
                    checklistDefinitions={checklistDefinitions}
                    currentStageId={athlete.current_stage_id}
                    editable
                    onChanged={load}
                  />
                </div>
              </Panel>
            )}
            {tab === "data" && (
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
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      {athlete.slug || "Será gerado automaticamente ao salvar"}
                    </div>
                  </Field>
                  <Field label="Nascimento">
                    <input
                      className={inputClass}
                      type="date"
                      value={athlete.birth_date ?? ""}
                      onChange={(e) => update("birth_date", e.target.value || null)}
                    />
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
                    <SearchableSelect
                      value={athlete.nationality ?? ""}
                      placeholder="Buscar país"
                      options={countries.map((item) => ({
                        value: item.code,
                        label: `${item.flag_emoji ?? ""} ${item.name_pt}`.trim(),
                      }))}
                      onChange={(value) => update("nationality", value || null)}
                    />
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
                  <Field label="Foto">
                    <label
                      className={
                        secondaryButtonClass +
                        " mt-1 flex cursor-pointer items-center justify-center gap-2"
                      }
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingPhoto ? "Enviando..." : "Selecionar foto"}
                      <input
                        className="hidden"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => void uploadPhoto(e.target.files?.[0])}
                      />
                    </label>
                    {athlete.photo_url && (
                      <img
                        src={athlete.photo_url}
                        alt="Preview da foto"
                        className="mt-3 h-40 w-full rounded-md object-cover"
                      />
                    )}
                  </Field>
                </div>
              </Panel>
            )}
            {tab === "profile" && (
              <>
                <Panel title="Perfil público e acadêmico">
                  <div className="grid gap-4 p-5 md:grid-cols-2">
                    <Field label="Subtítulo do Hero (ex: Performance · Personality · Potential)" wide>
                      <input
                        className={inputClass}
                        placeholder="Performance · Personality · Potential"
                        value={profile.subtitle ?? ""}
                        onChange={(e) => setProfile({ ...profile, subtitle: e.target.value })}
                      />
                    </Field>
                    <Field label="Biografia EN (Descrição do atleta)" wide>
                      <textarea
                        className={textareaClass}
                        rows={4}
                        placeholder="Detailed athletic and academic background..."
                        value={profile.bio_en ?? ""}
                        onChange={(e) => setProfile({ ...profile, bio_en: e.target.value })}
                      />
                    </Field>
                    <Field label="What She/He Brings to the Team (EN)" wide>
                      <textarea
                        className={textareaClass}
                        rows={3}
                        placeholder="Explique o diferencial técnico, tático e comportamental que o atleta agrega à equipe..."
                        value={profile.team_contribution_en ?? ""}
                        onChange={(e) =>
                          setProfile({ ...profile, team_contribution_en: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Biografia PT" wide>
                      <textarea
                        className={textareaClass}
                        rows={3}
                        value={profile.bio_pt ?? ""}
                        onChange={(e) => setProfile({ ...profile, bio_pt: e.target.value })}
                      />
                    </Field>
                    <Field label="Current School (Escola / Universidade Atual)">
                      <input
                        className={inputClass}
                        placeholder="ex: Colégio Santa Cruz / Mackenzie"
                        value={profile.current_school ?? ""}
                        onChange={(e) =>
                          setProfile({ ...profile, current_school: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="High School Graduation (ex: Class of 2025)">
                      <input
                        className={inputClass}
                        placeholder="ex: Class of 2025 / Dez 2025"
                        value={profile.high_school_graduation ?? ""}
                        onChange={(e) =>
                          setProfile({ ...profile, high_school_graduation: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Seeking Opportunities For">
                      <input
                        className={inputClass}
                        placeholder="ex: Fall 2026 / D1, D2, NAIA Scholarships"
                        value={profile.seeking_opportunities ?? ""}
                        onChange={(e) =>
                          setProfile({ ...profile, seeking_opportunities: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="TOEFL / Duolingo Score">
                      <input
                        className={inputClass}
                        placeholder="ex: Duolingo 120 / TOEFL 88"
                        value={profile.toefl_duolingo_score ?? ""}
                        onChange={(e) =>
                          setProfile({ ...profile, toefl_duolingo_score: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Current GPA">
                      <input
                        className={inputClass}
                        type="number"
                        step="0.01"
                        placeholder="ex: 3.85"
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
                        placeholder="ex: Fluent / Advanced"
                        value={profile.english_level ?? ""}
                        onChange={(e) => setProfile({ ...profile, english_level: e.target.value })}
                      />
                    </Field>
                    <Field label="Budget / Orçamento anual">
                      <input
                        className={inputClass}
                        placeholder="ex: Up to $15,000/yr / Flexible"
                        value={profile.budget ?? ""}
                        onChange={(e) => setProfile({ ...profile, budget: e.target.value })}
                      />
                    </Field>
                    <Field label="Seasons of Eligibility Left">
                      <input
                        className={inputClass}
                        placeholder="ex: 4 seasons / 4 years"
                        value={profile.seasons_eligibility ?? ""}
                        onChange={(e) =>
                          setProfile({ ...profile, seasons_eligibility: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Ano de conclusão numérico">
                      <input
                        className={inputClass}
                        type="number"
                        placeholder="ex: 2025"
                        value={profile.graduation_year ?? ""}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            graduation_year: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </Field>
                    <Field label="Vídeo arquivo direto (opcional)">
                      <label
                        className={
                          secondaryButtonClass +
                          " mt-1 flex cursor-pointer items-center justify-center gap-2"
                        }
                      >
                        <Upload className="h-4 w-4" />
                        {uploadingVideo ? "Enviando..." : "Selecionar vídeo"}
                        <input
                          className="hidden"
                          type="file"
                          accept="video/mp4,video/quicktime"
                          onChange={(e) => void uploadHighlightVideo(e.target.files?.[0])}
                        />
                      </label>
                      {profile.highlight_video_url && (
                        isValidYoutubeUrl(profile.highlight_video_url) ? (
                          <div className="mt-3 flex items-center gap-3 rounded-md border p-2.5 bg-muted/40">
                            <img
                              src={youtubeThumbnail(profile.highlight_video_url) ?? ""}
                              alt=""
                              className="h-14 w-24 rounded object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-primary">YouTube URL configurada no perfil</p>
                              <p className="truncate text-xs text-muted-foreground">{profile.highlight_video_url}</p>
                            </div>
                          </div>
                        ) : (
                          <video
                            src={profile.highlight_video_url}
                            controls
                            className="mt-3 h-40 w-full rounded-md object-cover"
                          />
                        )
                      )}
                    </Field>
                  </div>
                </Panel>
                <Panel
                  title="Vídeos do YouTube & Mídias Públicas"
                  description="Configure os vídeos que alimentam a atmosfera cinemática do hero, os reels de highlights, o vídeo de apresentação e as partidas em quadra."
                >
                  <div className="space-y-6 p-5">
                    {/* Formulário rápido de adição com Live Preview */}
                    <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-3">
                      <p className="text-sm font-semibold text-foreground">
                        + Adicionar ou atualizar vídeo do YouTube
                      </p>
                      <div className="grid gap-3 md:grid-cols-[200px_1fr_1fr_auto] md:items-end">
                        <Field label="Finalidade / Destino">
                          <select
                            className={inputClass}
                            value={videoDraft.kind}
                            onChange={(e) =>
                              setVideoDraft({
                                ...videoDraft,
                                kind: e.target.value as AthleteVideoKind,
                              })
                            }
                          >
                            <option value="feature">🎬 Destaque (Fundo Hero & Catálogo)</option>
                            <option value="presentation">🗣️ Apresentação (Fala do Atleta)</option>
                            <option value="highlight">📱 Highlight (Reel / Stories)</option>
                            <option value="in_court">🏐 Em Quadra (Jogos / Lances)</option>
                          </select>
                        </Field>
                        <Field label="Título descritivo (opcional)">
                          <input
                            className={inputClass}
                            placeholder="ex: Highlights 2025 / Melhores Lances"
                            value={videoDraft.title}
                            onChange={(e) =>
                              setVideoDraft({ ...videoDraft, title: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Link do YouTube (Watch, Shorts, Embed...)">
                          <input
                            className={inputClass}
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={videoDraft.youtube_url}
                            onChange={(e) =>
                              setVideoDraft({ ...videoDraft, youtube_url: e.target.value })
                            }
                          />
                        </Field>
                        <button className={buttonClass} onClick={() => void addVideo()}>
                          Salvar vídeo
                        </button>
                      </div>

                      {/* Live Thumbnail Preview */}
                      {videoDraft.youtube_url && (
                        <div className="mt-2 flex items-center gap-3 rounded-md bg-muted/40 p-2.5">
                          {youtubeThumbnail(videoDraft.youtube_url) ? (
                            <>
                              <img
                                src={youtubeThumbnail(videoDraft.youtube_url) ?? ""}
                                alt="Prévia"
                                className="h-12 w-20 rounded object-cover shadow-xs"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                                  ✓ Link do YouTube reconhecido
                                </span>
                                <p className="truncate text-xs text-muted-foreground">
                                  {videoDraft.youtube_url}
                                </p>
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-destructive">
                              ⚠️ Link do YouTube inválido ou incompleto. Verifique a URL digitada.
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Lista dos vídeos agrupados por finalidade */}
                    <div className="space-y-5">
                      {/* Destaque / Hero */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          🎬 Vídeo de Destaque / Hero (Fundo cinemático e capa do catálogo)
                        </h4>
                        {videos.filter((v) => v.kind === "feature").length > 0 ? (
                          videos
                            .filter((v) => v.kind === "feature")
                            .map((item) => (
                              <VideoItemCard
                                key={item.id}
                                item={item}
                                label="Destaque (Hero)"
                                onDelete={() => void deleteVideo(item)}
                              />
                            ))
                        ) : (
                          <p className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
                            Nenhum vídeo de destaque específico cadastrado. O sistema usará o primeiro vídeo disponível como atmosfera do hero.
                          </p>
                        )}
                      </div>

                      {/* Apresentação */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          🗣️ Vídeo de Apresentação (Fala e objetivos do atleta)
                        </h4>
                        {videos.filter((v) => v.kind === "presentation").length > 0 ? (
                          videos
                            .filter((v) => v.kind === "presentation")
                            .map((item) => (
                              <VideoItemCard
                                key={item.id}
                                item={item}
                                label="Apresentação"
                                onDelete={() => void deleteVideo(item)}
                              />
                            ))
                        ) : (
                          <p className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
                            Nenhum vídeo de apresentação cadastrado.
                          </p>
                        )}
                      </div>

                      {/* Highlights / Reels */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          📱 Highlights (Bolinhas de Reels / Stories verticais)
                        </h4>
                        {videos.filter((v) => v.kind === "highlight").length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {videos
                              .filter((v) => v.kind === "highlight")
                              .map((item) => (
                                <VideoItemCard
                                  key={item.id}
                                  item={item}
                                  label="Highlight (Reel)"
                                  onDelete={() => void deleteVideo(item)}
                                />
                              ))}
                          </div>
                        ) : (
                          <p className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
                            Nenhum reel cadastrado. Adicione vídeos/shorts para exibir os Stories de highlights.
                          </p>
                        )}
                      </div>

                      {/* Em Quadra / Jogos */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          🏐 Em Quadra (Jogos completos e lances de partida)
                        </h4>
                        {videos.filter((v) => v.kind === "in_court").length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {videos
                              .filter((v) => v.kind === "in_court")
                              .map((item) => (
                                <VideoItemCard
                                  key={item.id}
                                  item={item}
                                  label="Em Quadra"
                                  onDelete={() => void deleteVideo(item)}
                                />
                              ))}
                          </div>
                        ) : (
                          <p className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
                            Nenhum vídeo de jogo/quadra cadastrado.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Panel>
                <Panel
                  title="Mídia enviada"
                  action={
                    <button
                      className={secondaryButtonClass}
                      onClick={() => setShowAchievementForm((value) => !value)}
                    >
                      {showAchievementForm ? "Fechar" : "+ Conquista"}
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
                  {showAchievementForm && (
                    <div className="border-t p-5">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Título">
                          <input
                            className={inputClass}
                            value={achievementDraft.title}
                            onChange={(e) =>
                              setAchievementDraft({ ...achievementDraft, title: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Tipo">
                          <input
                            className={inputClass}
                            value={achievementDraft.type}
                            onChange={(e) =>
                              setAchievementDraft({ ...achievementDraft, type: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Descrição" wide>
                          <textarea
                            className={textareaClass}
                            value={achievementDraft.description}
                            onChange={(e) =>
                              setAchievementDraft({
                                ...achievementDraft,
                                description: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label="Data">
                          <input
                            className={inputClass}
                            type="date"
                            value={achievementDraft.achievedOn}
                            onChange={(e) =>
                              setAchievementDraft({
                                ...achievementDraft,
                                achievedOn: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label="Imagem da conquista">
                          <input
                            className={inputClass}
                            placeholder="URL da imagem"
                            value={achievementDraft.imageUrl}
                            onChange={(e) =>
                              setAchievementDraft({ ...achievementDraft, imageUrl: e.target.value })
                            }
                          />
                          <label
                            className={
                              secondaryButtonClass +
                              " mt-2 flex cursor-pointer items-center justify-center gap-2"
                            }
                          >
                            <Upload className="h-4 w-4" />
                            {uploadingAchievementImage ? "Enviando..." : "Enviar imagem"}
                            <input
                              className="hidden"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(e) => void uploadAchievementImage(e.target.files?.[0])}
                            />
                          </label>
                          {achievementDraft.imageUrl && (
                            <img
                              src={achievementDraft.imageUrl}
                              alt="Pré-visualização da conquista"
                              className="mt-2 h-28 w-full rounded-md object-cover"
                            />
                          )}
                        </Field>
                        <Field label="Medalha">
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={achievementDraft.medal}
                              onChange={(e) =>
                                setAchievementDraft({
                                  ...achievementDraft,
                                  medal: e.target.checked,
                                })
                              }
                            />
                            Marcar como medalha
                          </label>
                        </Field>
                      </div>
                      <div className="mt-4 flex gap-3">
                        <button className={buttonClass} onClick={() => void saveAchievement()}>
                          Salvar conquista
                        </button>
                        <button
                          className={secondaryButtonClass}
                          onClick={() => setShowAchievementForm(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="border-t p-5">
                    <h3 className="font-medium">Conquistas publicadas</h3>
                    <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                      {achievements.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start justify-between gap-3 rounded-md border p-3"
                        >
                          <div className="flex gap-3">
                            {item.image_url && (
                              <img
                                src={item.image_url}
                                alt=""
                                className="h-14 w-20 shrink-0 rounded object-cover"
                              />
                            )}
                            <div>
                              <p className="font-medium text-foreground">
                                {item.title_pt ?? item.title_en}
                              </p>
                              <p className="mt-1 text-xs">
                                {item.description_pt ?? item.description_en}
                              </p>
                            </div>
                          </div>
                          <button
                            className="text-xs text-destructive"
                            onClick={() => void deleteAchievement(item)}
                          >
                            Excluir
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Panel>
              </>
            )}
          </div>
          <div className="space-y-6">
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
            <AthleteAccessCard
              athleteId={athlete.id}
              athleteEmail={athlete.email}
              hasAccess={Boolean(athlete.user_id)}
              onChanged={load}
            />
          </div>
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

function VideoItemCard({
  item,
  label,
  onDelete,
}: {
  item: AthleteVideo;
  label: string;
  onDelete: () => void;
}) {
  const thumb = youtubeThumbnail(item.youtube_url);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-3 shadow-xs">
      {thumb ? (
        <img src={thumb} alt="" className="h-14 w-24 rounded-md object-cover shrink-0" />
      ) : (
        <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
          Sem preview
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">
          {item.title || label}
        </p>
        <p className="truncate text-xs text-muted-foreground">{item.youtube_url}</p>
      </div>
      <button
        aria-label="Remover vídeo"
        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 transition cursor-pointer"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
