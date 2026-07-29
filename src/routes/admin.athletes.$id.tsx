import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { Panel, buttonClass, inputClass, secondaryButtonClass, textareaClass } from "@/components/admin-ui";
import { inviteAthlete } from "@/lib/auth.functions";
import { supabase } from "@/lib/supabase/client";
import type { Athlete, AthleteProfile, Country, Position, Sport } from "@/types/db";

export const Route = createFileRoute("/admin/athletes/$id")({ component: AthleteEditor });

function AthleteEditor() {
  const { id } = Route.useParams();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [profile, setProfile] = useState<Partial<AthleteProfile>>({});
  const [sports, setSports] = useState<Sport[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);

  async function load() {
    const [athleteResult, profileResult, sportsResult, positionsResult, countriesResult] = await Promise.all([
      supabase.from("athletes").select("*").eq("id", id).single(),
      supabase.from("athlete_profiles").select("*").eq("athlete_id", id).maybeSingle(),
      supabase.from("sports").select("*").order("name_pt"),
      supabase.from("positions").select("*").order("name_pt"),
      supabase.from("countries").select("*").order("name_pt"),
    ]);
    if (athleteResult.error) toast.error(athleteResult.error.message);
    else setAthlete(athleteResult.data as Athlete);
    setProfile((profileResult.data ?? { athlete_id: id }) as Partial<AthleteProfile>);
    setSports((sportsResult.data ?? []) as Sport[]);
    setPositions((positionsResult.data ?? []) as Position[]);
    setCountries((countriesResult.data ?? []) as Country[]);
  }
  useEffect(() => void load(), [id]);

  if (!athlete) return <ProtectedPage role="agency_admin"><AppShell role="agency_admin" title="Atleta"><div>Carregando...</div></AppShell></ProtectedPage>;

  async function save() {
    const { error } = await supabase.from("athletes").update(athlete).eq("id", id);
    if (error) return toast.error(error.message);
    const { error: profileError } = await supabase.from("athlete_profiles").upsert({ ...profile, athlete_id: id });
    if (profileError) toast.error(profileError.message);
    else toast.success("Perfil salvo.");
  }
  async function invite() {
    if (!athlete.email) return toast.error("Informe o e-mail do atleta.");
    try { await inviteAthlete({ data: { athleteId: id, email: athlete.email } }); toast.success("Convite enviado."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao enviar convite."); }
  }
  async function archive() {
    const deleted_at = athlete.deleted_at ? null : new Date().toISOString();
    const { error } = await supabase.from("athletes").update({ deleted_at, is_public: deleted_at ? false : athlete.is_public }).eq("id", id);
    if (error) toast.error(error.message); else { setAthlete({ ...athlete, deleted_at }); toast.success(deleted_at ? "Atleta arquivado." : "Atleta restaurado."); }
  }
  const update = <K extends keyof Athlete>(key: K, value: Athlete[K]) => setAthlete({ ...athlete, [key]: value });

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title={athlete.full_name}>
        <div className="mb-6 flex flex-wrap gap-3">
          <button className={buttonClass} onClick={save}>Salvar alterações</button>
          <button className={secondaryButtonClass} onClick={invite}>Enviar convite</button>
          <button className={secondaryButtonClass} onClick={archive}>{athlete.deleted_at ? "Restaurar" : "Arquivar"}</button>
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Panel title="Dados do atleta">
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <Field label="Nome"><input className={inputClass} value={athlete.full_name} onChange={(e) => update("full_name", e.target.value)} /></Field>
                <Field label="E-mail"><input className={inputClass} type="email" value={athlete.email ?? ""} onChange={(e) => update("email", e.target.value || null)} /></Field>
                <Field label="Slug"><input className={inputClass} value={athlete.slug} onChange={(e) => update("slug", e.target.value)} /></Field>
                <Field label="Nascimento"><input className={inputClass} type="date" value={athlete.birth_date ?? ""} onChange={(e) => update("birth_date", e.target.value || null)} /></Field>
                <Field label="Esporte"><select className={inputClass} value={athlete.sport_id ?? ""} onChange={(e) => update("sport_id", e.target.value || null)}><option value="">Selecione</option>{sports.map((item) => <option key={item.id} value={item.id}>{item.name_pt}</option>)}</select></Field>
                <Field label="Posição"><select className={inputClass} value={athlete.position_id ?? ""} onChange={(e) => update("position_id", e.target.value || null)}><option value="">Selecione</option>{positions.filter((item) => !athlete.sport_id || item.sport_id === athlete.sport_id).map((item) => <option key={item.id} value={item.id}>{item.name_pt}</option>)}</select></Field>
                <Field label="Nacionalidade"><select className={inputClass} value={athlete.nationality ?? ""} onChange={(e) => update("nationality", e.target.value || null)}><option value="">Selecione</option>{countries.map((item) => <option key={item.code} value={item.code}>{item.flag_emoji} {item.name_pt}</option>)}</select></Field>
                <Field label="Altura (cm)"><input className={inputClass} type="number" value={athlete.height_cm ?? ""} onChange={(e) => update("height_cm", e.target.value ? Number(e.target.value) : null)} /></Field>
                <Field label="Peso (kg)"><input className={inputClass} type="number" value={athlete.weight_kg ?? ""} onChange={(e) => update("weight_kg", e.target.value ? Number(e.target.value) : null)} /></Field>
                <Field label="Foto URL"><input className={inputClass} value={athlete.photo_url ?? ""} onChange={(e) => update("photo_url", e.target.value || null)} /></Field>
              </div>
            </Panel>
            <Panel title="Perfil público e acadêmico">
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <Field label="Biografia PT" wide><textarea className={textareaClass} value={profile.bio_pt ?? ""} onChange={(e) => setProfile({ ...profile, bio_pt: e.target.value })} /></Field>
                <Field label="Biografia EN" wide><textarea className={textareaClass} value={profile.bio_en ?? ""} onChange={(e) => setProfile({ ...profile, bio_en: e.target.value })} /></Field>
                <Field label="Ano de conclusão"><input className={inputClass} type="number" value={profile.graduation_year ?? ""} onChange={(e) => setProfile({ ...profile, graduation_year: e.target.value ? Number(e.target.value) : null })} /></Field>
                <Field label="GPA"><input className={inputClass} type="number" step="0.01" value={profile.gpa ?? ""} onChange={(e) => setProfile({ ...profile, gpa: e.target.value ? Number(e.target.value) : null })} /></Field>
                <Field label="Nível de inglês"><input className={inputClass} value={profile.english_level ?? ""} onChange={(e) => setProfile({ ...profile, english_level: e.target.value })} /></Field>
                <Field label="Vídeo destaque"><input className={inputClass} value={profile.highlight_video_url ?? ""} onChange={(e) => setProfile({ ...profile, highlight_video_url: e.target.value })} /></Field>
              </div>
            </Panel>
          </div>
          <Panel title="Publicação">
            <div className="space-y-5 p-5">
              <label className="flex items-center justify-between gap-4"><span><b className="block text-sm">Perfil público</b><small className="text-muted-foreground">Aparece no catálogo</small></span><input type="checkbox" checked={athlete.is_public} onChange={(e) => update("is_public", e.target.checked)} /></label>
              <label className="flex items-center justify-between gap-4"><span><b className="block text-sm">Em destaque</b><small className="text-muted-foreground">Hero do catálogo</small></span><input type="checkbox" checked={athlete.is_featured} onChange={(e) => update("is_featured", e.target.checked)} /></label>
              {athlete.is_public && <a href={`/athlete/${athlete.slug}`} target="_blank" rel="noreferrer" className={secondaryButtonClass + " w-full"}>Abrir perfil público</a>}
            </div>
          </Panel>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`block text-sm font-medium ${wide ? "md:col-span-2" : ""}`}>{label}<div className="mt-1.5">{children}</div></label>;
}
