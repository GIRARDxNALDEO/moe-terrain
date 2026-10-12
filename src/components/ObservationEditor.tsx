"use client";
import { useState, type FormEvent } from "react";
import { Camera, ImagePlus, ChevronDown, MapPin } from "lucide-react";
import { captureGPS } from "@/lib/gps";
import { saveObservation } from "@/lib/services";
import {
  labels,
  priorities,
  stateOf,
  type Observation,
  type ObservationState,
  type Meeting,
} from "@/lib/models";
export default function ObservationEditor({
  meeting,
  observation,
  author,
  initialTitle = "",
  onSaved,
  onCancel,
  onBusyChange,
}: {
  meeting: Meeting;
  observation?: Observation;
  author: string;
  initialTitle?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [state, setState] = useState<ObservationState>(
    observation
      ? stateOf(observation)
      : {
          title: initialTitle,
          description: "",
          lot: "",
          company: "",
          status: "new",
          priority: "normal",
        },
  );
  const [expectedUpdatedAt] = useState(observation?.updatedAt);
  const [comment, setComment] = useState("");
  const [details, setDetails] = useState(!!observation);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const field = (k: keyof ObservationState, v: string) =>
    setState((s) => ({ ...s, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setStage("Acquisition de la position…");
    try {
      const gps = await captureGPS();
      setStage("Enregistrement local…");
      const o = await saveObservation({
        meetingId: meeting.id,
        observationId: observation?.id,
        expectedUpdatedAt,
        state,
        comment,
        author,
        gps,
        files,
      });
      onSaved(o.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
      onBusyChange(false);
      setStage("");
    }
  }
  return (
    <form onSubmit={submit} className="editor">
      <p className="eyebrow">
        {observation ? "SUIVI DE L’OBSERVATION" : "NOUVEAU POINT TERRAIN"}
      </p>
      <h2>{observation ? "Actualiser le point" : "Que faut-il retenir ?"}</h2>
      <label>
        Titre
        <input
          autoFocus
          required
          maxLength={300}
          value={state.title}
          onChange={(e) => field("title", e.target.value)}
          placeholder="Ex. Accumulation d’eau — bâtiment E"
        />
      </label>
      {!observation && (
        <label>
          Note terrain
          <textarea
            rows={3}
            value={state.description}
            onChange={(e) => field("description", e.target.value)}
            placeholder="Décrire le constat et l’action attendue…"
          />
        </label>
      )}
      {observation && (
        <label>
          Commentaire de cette réunion
          <textarea
            autoFocus
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ex. Drain repris ; contrôle à effectuer."
            required={
              state.status === "closed" || observation.status === "closed"
            }
          />
        </label>
      )}
      <button
        className="details-toggle"
        type="button"
        onClick={() => setDetails(!details)}
      >
        Lot, entreprise et état <ChevronDown size={16} />
      </button>
      {details && (
        <div className="details-grid">
          <label>
            Lot
            <input
              value={state.lot}
              onChange={(e) => field("lot", e.target.value)}
              placeholder="VRD, électricité…"
            />
          </label>
          <label>
            Entreprise
            <input
              value={state.company}
              onChange={(e) => field("company", e.target.value)}
              placeholder="Entreprise concernée"
            />
          </label>
          <label>
            État
            <select
              aria-label="État"
              value={state.status}
              onChange={(e) => field("status", e.target.value)}
            >
              {Object.entries(labels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priorité
            <select
              aria-label="Priorité"
              value={state.priority}
              onChange={(e) => field("priority", e.target.value)}
            >
              {Object.entries(priorities).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {observation && (
            <label className="full">
              Description de référence
              <textarea
                rows={3}
                value={state.description}
                onChange={(e) => field("description", e.target.value)}
              />
            </label>
          )}
          {!observation && state.status === "closed" && (
            <label className="full">
              Motif de clôture
              <textarea
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
          )}
        </div>
      )}
      <div className="photo-actions">
        <label className="button secondary">
          <Camera size={18} />
          Prendre une photo
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const picked = Array.from(e.target.files || []);
              setFiles((f) => [...f, ...picked]);
              e.target.value = "";
            }}
          />
        </label>
        <label className="button secondary">
          <ImagePlus size={18} />
          Choisir
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const picked = Array.from(e.target.files || []);
              setFiles((f) => [...f, ...picked]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span>
                {f.name} · {(f.size / 1024 / 1024).toFixed(1)} Mo
              </span>
              <button
                type="button"
                onClick={() => setFiles((a) => a.filter((_, j) => j !== i))}
                aria-label={`Retirer ${f.name}`}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="helper">
        <MapPin size={14} />
        GPS enregistré à l’ajout, si autorisé. Pour une photo de galerie, il ne
        représente pas son lieu de prise de vue.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Annuler
        </button>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? stage : "Enregistrer le point"}
        </button>
      </div>
    </form>
  );
}
