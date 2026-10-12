"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { useLiveQuery } from "dexie-react-hooks";
import {
  FolderOpen,
  Plus,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Map,
  Download,
  Upload,
  Settings,
  ShieldCheck,
  WifiOff,
  Search,
  Flag,
  Clock,
  FileText,
  Copy,
  X,
  ChevronRight,
  MapPin,
  CalendarDays,
  LayoutGrid,
  HardHat,
  MoreHorizontal,
  Archive,
  CheckCheck,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  createProject,
  createMeeting,
  closeMeeting,
  setResumeMarker,
  markToCheck,
  addPlan,
  addMarker,
  reopenMeeting,
  updateMeeting,
  setObservationDeleted,
  setMeetingDeleted,
} from "@/lib/services";
import {
  exportProject,
  inspectArchive,
  commitArchive,
  download,
  type InspectedArchive,
} from "@/lib/archives";
import { importReport, decideCandidate, basePath } from "@/lib/documents";
import {
  labels,
  priorities,
  observationCode,
  localDate,
  type Observation,
  type Status,
  type Project,
  type ReviewCandidate,
  type Meeting,
  type ObservationEvent,
  type Photo,
  type MeetingObservation,
  type Plan,
  type PlanMarker,
  type SourceDocument,
  type Artifact,
  type Snapshot,
  type Setting,
  type MeetingRevision,
} from "@/lib/models";
import ObservationEditor from "./ObservationEditor";
import PhotoCard from "./PhotoCard";
const PDFViewer = dynamic(() => import("./PDFViewer"), {
  ssr: false,
  loading: () => <p>Chargement du visualiseur…</p>,
});
type Tab = "meetings" | "observations" | "plans" | "transfer";
type Modal =
  | "project"
  | "meeting"
  | "editor"
  | "close"
  | "settings"
  | "import"
  | "report"
  | null;
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const humanDate = (date: string) =>
  new Date(date.length === 10 ? date + "T12:00:00" : date).toLocaleDateString(
    "fr-FR",
    { day: "numeric", month: "long", year: "numeric" },
  );
function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", listener);
      previousFocus?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <section
        ref={root}
        tabIndex={-1}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-heading">
          <span>{title}</span>
          <button className="icon-button" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge ${status}`}>
      <span />
      {labels[status]}
    </span>
  );
}
export default function TerrainApp() {
  const projects = useLiveQuery<Project[], Project[]>(
    () => db.projects.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const [editorBusy, setEditorBusy] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [meetingId, setMeetingId] = useState<string>("");
  const [observationId, setObservationId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("meetings");
  const [modal, setModal] = useState<Modal>(null);
  const [editingId, setEditingId] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [candidate, setCandidate] = useState<ReviewCandidate>();
  const [filter, setFilter] = useState("check");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [ready, setReady] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent>();
  const [storage, setStorage] = useState<{
    usage?: number;
    quota?: number;
    persisted?: boolean;
  }>({});
  const [archive, setArchive] = useState<InspectedArchive>();
  const [backupDone, setBackupDone] = useState(false);
  const [planId, setPlanId] = useState("");
  const [markerObservationId, setMarkerObservationId] = useState("");
  const [placing, setPlacing] = useState(false);
  const [readyZip, setReadyZip] = useState<{
    url: string;
    name: string;
    projectId: string;
  }>();
  useEffect(
    () => () => {
      if (readyZip) URL.revokeObjectURL(readyZip.url);
    },
    [readyZip],
  );
  const [progress, setProgress] = useState(0);
  const settings = useLiveQuery<Setting[], Setting[]>(
    () => db.settings.toArray(),
    [],
    [],
  );
  const author =
    settings.find((s) => s.key === "author")?.value || "Auteur local";
  const allMeetings = useLiveQuery<Meeting[], Meeting[]>(
    () =>
      projectId
        ? db.meetings.where("projectId").equals(projectId).toArray()
        : Promise.resolve([]),
    [projectId],
    [],
  );
  const allObservations = useLiveQuery<Observation[], Observation[]>(
    () =>
      projectId
        ? db.observations.where("projectId").equals(projectId).toArray()
        : Promise.resolve([]),
    [projectId],
    [],
  );
  const allEvents = useLiveQuery<ObservationEvent[], ObservationEvent[]>(
    () =>
      projectId
        ? db.observationEvents.where("projectId").equals(projectId).toArray()
        : Promise.resolve([]),
    [projectId],
    [],
  );
  const photos = useLiveQuery<Photo[], Photo[]>(
    () =>
      projectId
        ? db.photos.where("projectId").equals(projectId).toArray()
        : Promise.resolve([]),
    [projectId],
    [],
  );
  const links = useLiveQuery<MeetingObservation[], MeetingObservation[]>(
    () =>
      meetingId
        ? db.meetingObservations.where("meetingId").equals(meetingId).toArray()
        : Promise.resolve([]),
    [meetingId],
    [],
  );
  const plans = useLiveQuery<Plan[], Plan[]>(
    () =>
      projectId
        ? db.plans.where("projectId").equals(projectId).toArray()
        : Promise.resolve([]),
    [projectId],
    [],
  );
  const markers = useLiveQuery<PlanMarker[], PlanMarker[]>(
    () =>
      projectId
        ? db.planMarkers.where("projectId").equals(projectId).toArray()
        : Promise.resolve([]),
    [projectId],
    [],
  );
  const candidates = useLiveQuery<ReviewCandidate[], ReviewCandidate[]>(
    () =>
      meetingId
        ? db.reviewCandidates.where("meetingId").equals(meetingId).toArray()
        : Promise.resolve([]),
    [meetingId],
    [],
  );
  const documents = useLiveQuery<SourceDocument[], SourceDocument[]>(
    () =>
      projectId
        ? db.sourceDocuments.where("projectId").equals(projectId).toArray()
        : Promise.resolve([]),
    [projectId],
    [],
  );
  const artifact = useLiveQuery<Artifact | undefined>(
    async () =>
      meetingId
        ? db.generatedArtifacts.where("meetingId").equals(meetingId).first()
        : Promise.resolve(undefined),
    [meetingId],
  );
  const snapshot = useLiveQuery<Snapshot | undefined>(
    async () =>
      meetingId
        ? db.meetingSnapshots.where("meetingId").equals(meetingId).first()
        : Promise.resolve(undefined),
    [meetingId],
  );
  const meetings = allMeetings.filter((m) => !m.deletedAt);
  const observations = allObservations.filter((o) => !o.deletedAt);
  const events = allEvents.filter((e) =>
    meetings.some((m) => m.id === e.meetingId),
  );
  const revisions = useLiveQuery<MeetingRevision[], MeetingRevision[]>(
    () =>
      meetingId
        ? db.meetingRevisions.where("meetingId").equals(meetingId).toArray()
        : Promise.resolve([]),
    [meetingId],
    [],
  );
  const project = projects.find((p) => p.id === projectId);
  const meeting = meetings.find((m) => m.id === meetingId);
  const observation = observations.find((o) => o.id === observationId);
  const plan = plans.find((p) => p.id === planId) || plans[0];
  const activeMeeting =
    meeting && meeting.status !== "closed"
      ? meeting
      : [...meetings]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .find((m) => m.status !== "closed");
  const pending = candidates.filter((c) => c.decision === "pending");
  const toCheck = new Set(
    links
      .filter(
        (l) =>
          observations.some((o) => o.id === l.observationId) &&
          l.toCheck &&
          !l.checkedAt,
      )
      .map((l) => l.observationId),
  );
  const currentEvents = events.filter((e) => e.meetingId === meetingId);
  const touched = new Set(currentEvents.map((e) => e.observationId));
  const viewedObservations =
    tab === "meetings" && meeting?.status === "closed" && snapshot
      ? snapshot.observations
      : observations;
  const listed = viewedObservations
    .filter((o) => {
      const match =
        filter === "all" ||
        (filter === "check" &&
          (tab === "meetings" && meeting?.status === "closed"
            ? snapshot?.uncheckedObservationIds.includes(o.id)
            : toCheck.has(o.id))) ||
        (filter === "new" &&
          (tab === "meetings" && meetingId
            ? currentEvents.some(
                (e) => e.observationId === o.id && e.kind === "created",
              )
            : o.status === "new")) ||
        (filter === "modified" && touched.has(o.id)) ||
        filter === o.status;
      return (
        observations.some((current) => current.id === o.id) &&
        match &&
        `${o.title} ${o.lot} ${o.company} ${observationCode(o)}`
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    })
    .sort((a, b) => a.number - b.number);
  useEffect(() => {
    const onLine = () => setOffline(!navigator.onLine);
    onLine();
    window.addEventListener("online", onLine);
    window.addEventListener("offline", onLine);
    const beforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    const status = (e: MessageEvent) => {
      if (e.data?.type === "OFFLINE_READY") setReady(true);
    };
    navigator.serviceWorker?.addEventListener("message", status);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
        .then(async (reg) => {
          const r = await navigator.serviceWorker.ready;
          r.active?.postMessage({ type: "CHECK_READY" });
          if (reg.waiting)
            setMessage(
              "Une mise à jour est disponible. Fermez puis rouvrez l’application après enregistrement.",
            );
        })
        .catch(() =>
          setError(
            "Le mode hors ligne n’a pas pu être préparé. Vérifiez que l’application est ouverte en HTTPS.",
          ),
        );
    }
    navigator.storage?.estimate().then((s) => setStorage(s));
    navigator.storage
      ?.persisted()
      .then((p) => setStorage((s) => ({ ...s, persisted: p })));
    return () => {
      window.removeEventListener("online", onLine);
      window.removeEventListener("offline", onLine);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      navigator.serviceWorker?.removeEventListener("message", status);
    };
  }, []);
  useEffect(() => {
    if (!busy && !editorBusy) return;
    const stop = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [busy, editorBusy]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(t);
  }, [message]);
  async function act(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "L’opération a échoué.");
    } finally {
      setBusy("");
    }
  }
  function chooseProject(p: Project) {
    setProjectId(p.id);
    setMeetingId("");
    setObservationId("");
    setTab("meetings");
    setSearch("");
    setFilter("all");
  }
  function openMeeting(id: string) {
    setMeetingId(id);
    setObservationId("");
    setFilter("check");
    setTab("meetings");
    setSearch("");
  }
  function newObservation(title = "", source?: ReviewCandidate) {
    setEditingId("");
    setInitialTitle(title);
    setCandidate(source);
    setModal("editor");
  }
  async function doExport(id = projectId) {
    setProgress(0);
    const out = await exportProject(id, setProgress);
    const url = URL.createObjectURL(out.blob);
    setReadyZip({ url, name: out.name, projectId: id });
    requestAnimationFrame(() =>
      document
        .getElementById("zip-ready")
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
    try {
      download(out.blob, out.name);
      setMessage(
        "ZIP prêt. Si le téléchargement ne démarre pas, utilisez le lien « Télécharger le ZIP prêt » ci-dessous.",
      );
    } catch {
      setMessage(
        "ZIP généré. Touchez « Télécharger le ZIP prêt » pour le récupérer.",
      );
    }
  }
  async function handleZip(file: File) {
    await act("Vérification de l’archive…", async () => {
      const a = await inspectArchive(file);
      setArchive(a);
      setBackupDone(false);
      setModal("import");
    });
  }
  const sourceDocument = documents.find(
    (d) => d.id === meeting?.sourceDocumentId,
  );
  const tabs: { key: Tab; label: string; icon: typeof Map }[] = [
    { key: "meetings", label: "Réunions", icon: CalendarDays },
    { key: "observations", label: "Observations", icon: ClipboardList },
    { key: "plans", label: "Plans", icon: Map },
    { key: "transfer", label: "Transfert", icon: Archive },
  ];
  function observationRows() {
    return (
      <>
        <div className="list-toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              aria-label="Rechercher une observation"
              placeholder="Rechercher un point, une entreprise…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="muted">
            {listed.length} point{listed.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="filter-row">
          {[
            {
              key: "check",
              label: "À contrôler",
              count:
                tab === "meetings" && meeting?.status === "closed"
                  ? snapshot?.uncheckedObservationIds.length
                  : toCheck.size,
            },
            { key: "new", label: "Nouveaux" },
            { key: "in_progress", label: "En cours" },
            { key: "blocking", label: "Bloquants" },
            { key: "closed", label: "Clôturés" },
            { key: "all", label: "Tous" },
          ].map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "filter active" : "filter"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.count !== undefined && <span>{f.count}</span>}
            </button>
          ))}
        </div>
        {listed.length ? (
          <div className="observation-list">
            {listed.map((o) => (
              <button
                className="observation-row"
                key={o.id}
                onClick={() => setObservationId(o.id)}
              >
                <div className={`observation-symbol ${o.status}`}>
                  {o.status === "closed" ? (
                    <Check size={20} />
                  ) : o.status === "blocking" ? (
                    <Flag size={20} />
                  ) : (
                    <ClipboardList size={20} />
                  )}
                </div>
                <div className="row-content">
                  <div className="row-top">
                    <span className="code">{observationCode(o)}</span>
                    <StatusBadge status={o.status} />
                    {o.priority === "urgent" && (
                      <span className="urgent">Urgent</span>
                    )}
                  </div>
                  <h3>{o.title}</h3>
                  <p>
                    {o.lot || "Lot non renseigné"}
                    <span> · </span>
                    {o.company || "Entreprise non renseignée"}
                  </p>
                </div>
                <div className="row-end">
                  {toCheck.has(o.id) && meeting?.status !== "closed" ? (
                    <span className="to-check">À contrôler</span>
                  ) : links.find((l) => l.observationId === o.id)?.checkedAt &&
                    meeting?.status !== "closed" ? (
                    <CheckCheck size={18} />
                  ) : null}
                  <ChevronRight size={18} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty compact">
            <CheckCircle2 size={30} />
            <h3>
              {filter === "check"
                ? "Aucun point en attente de contrôle"
                : "Aucun point dans cette vue"}
            </h3>
            <p>
              {filter === "check"
                ? "Les points ouverts seront proposés à la prochaine réunion."
                : "Changez de filtre ou ajoutez une observation."}
            </p>
          </div>
        )}
      </>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => {
            setProjectId("");
            setMeetingId("");
            setObservationId("");
          }}
        >
          <img src={`${basePath}/icons/icon-192.png`} alt="" />
          <div>
            MOE Terrain<small>MÉMOIRE DU CHANTIER</small>
          </div>
        </button>
        <div className="sidebar-section">ESPACE LOCAL</div>
        <button
          className={`nav-item ${!project ? "selected" : ""}`}
          onClick={() => {
            setProjectId("");
            setMeetingId("");
            setObservationId("");
          }}
        >
          <LayoutGrid size={18} />
          Mes chantiers
        </button>
        {project && (
          <>
            <div className="sidebar-section">
              {project.reference || "CHANTIER ACTIF"}
            </div>
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`nav-item ${tab === t.key ? "selected" : ""}`}
                onClick={() => {
                  setTab(t.key);
                  setObservationId("");
                  if (t.key !== "meetings") setFilter("all");
                }}
              >
                <t.icon size={18} />
                {t.label}
              </button>
            ))}
          </>
        )}
        <div className="sidebar-bottom">
          <div className="privacy-box">
            <ShieldCheck size={20} />
            <strong>Vos données, ici.</strong>
            <p>
              Stockage sur cet appareil.
              <br />
              Sauvegarde par ZIP.
            </p>
          </div>
          <button className="nav-item" onClick={() => setModal("settings")}>
            <Settings size={18} />
            Préférences
          </button>
          <img
            className="naldeo-logo"
            src={`${basePath}/branding/naldeo-white.png`}
            alt="Le Groupe Naldeo"
          />
          <small className="version">MOE Terrain · V0.1.1</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <HardHat size={19} />
            <span>MOE Terrain</span>
            {project && (
              <>
                <ChevronRight size={14} />
                <span>{project.name}</span>
              </>
            )}
          </div>
          <div className="top-status">
            <span className="device-status">
              <span className={ready ? "dot ready" : "dot"} />
              {offline ? (
                <>
                  <WifiOff size={14} />
                  Hors ligne
                </>
              ) : ready ? (
                "Prêt hors ligne"
              ) : (
                "Préparation hors ligne"
              )}
            </span>
            <button
              className="avatar"
              title="Préférences et auteur local"
              onClick={() => setModal("settings")}
            >
              {author === "Auteur local"
                ? "MO"
                : author
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
            </button>
          </div>
        </header>
        {busy && (
          <div className="busy-bar" role="status">
            {busy}
            {busy.includes("Export") ? ` ${Math.round(progress)} %` : ""}
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            <span>{error}</span>
            <button aria-label="Fermer l’erreur" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {message && (
          <div className="alert success" role="status">
            <Check size={17} />
            <span>{message}</span>
          </div>
        )}
        <main className="main-content">
          {readyZip && readyZip.projectId === projectId && (
            <div className="notice" id="zip-ready">
              <Archive size={18} />
              <span>Archive prête : {readyZip.name}</span>
              <a
                className="button primary small"
                href={readyZip.url}
                download={readyZip.name}
              >
                Télécharger le ZIP prêt
              </a>
            </div>
          )}
          {!project ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">DU TERRAIN AU COMPTE-RENDU</p>
                  <h1>
                    Mes chantiers<span className="heading-dot">.</span>
                  </h1>
                  <p className="subtitle">
                    Préparer, observer, suivre. Une mémoire pour chaque
                    chantier.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal("project")}
                >
                  <Plus size={18} />
                  Nouveau projet
                </button>
              </div>
              <div className="welcome-panel">
                <div>
                  <span className="welcome-label">
                    <ShieldCheck size={15} />
                    100 % local
                  </span>
                  <h2>
                    Le fil du chantier,
                    <br />
                    réunion après réunion.
                  </h2>
                  <p>
                    Vos points restent suivis jusqu’à leur levée.
                    <br />
                    Word conserve le compte-rendu officiel.
                  </p>
                </div>
                <div className="welcome-visual">
                  <div className="visual-line" />
                  <div className="visual-step">
                    <span>
                      <ClipboardList size={18} />
                    </span>
                    <div>
                      Constater<small>Observation créée</small>
                    </div>
                  </div>
                  <div className="visual-step">
                    <span>
                      <Clock size={18} />
                    </span>
                    <div>
                      Suivre<small>Historique conservé</small>
                    </div>
                  </div>
                  <div className="visual-step done">
                    <span>
                      <Check size={18} />
                    </span>
                    <div>
                      Clôturer<small>Contrôle conforme</small>
                    </div>
                  </div>
                </div>
              </div>
              <div className="section-heading">
                <h2>
                  Vos projets <span className="count">{projects.length}</span>
                </h2>
                <label className="text-button">
                  <Upload size={16} />
                  Importer un ZIP
                  <input
                    className="sr-only"
                    accept=".zip"
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleZip(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {projects.length ? (
                <div className="project-grid">
                  {projects.map((p) => (
                    <button
                      className="project-card"
                      key={p.id}
                      onClick={() => chooseProject(p)}
                    >
                      <div className="card-top">
                        <span className="project-icon">
                          <FolderOpen size={23} />
                        </span>
                        <ArrowUpRight size={19} />
                      </div>
                      <p className="eyebrow">{p.reference || "PROJET LOCAL"}</p>
                      <h3>{p.name}</h3>
                      <p>{p.clientName || "Maître d’ouvrage non renseigné"}</p>
                      <div className="card-footer">
                        <span className="dot ready" />
                        Sur cet appareil
                        <span className="spacer" />
                        {humanDate(p.updatedAt)}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <FolderOpen size={36} />
                  <h2>Votre premier chantier commence ici</h2>
                  <p>
                    Créez un projet ou importez une archive depuis un autre
                    appareil.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => setModal("project")}
                  >
                    <Plus size={17} />
                    Créer un projet
                  </button>
                </div>
              )}
              <div className="footnote">
                <Archive size={15} />
                Après chaque réunion, exportez votre projet pour conserver une
                sauvegarde indépendante.
              </div>
            </>
          ) : observation ? (
            <>
              <button
                className="back-link"
                onClick={() => setObservationId("")}
              >
                <ArrowLeft size={16} />
                Retour aux points
              </button>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {observationCode(observation)} · {project.name}
                  </p>
                  <h1>{observation.title}</h1>
                  <div className="detail-meta">
                    <StatusBadge status={observation.status} />
                    <span>{priorities[observation.priority]}</span>
                    <span>{observation.lot || "Sans lot"}</span>
                    <span>{observation.company || "Sans entreprise"}</span>
                  </div>
                </div>
                {activeMeeting && (
                  <button
                    className="button primary"
                    onClick={() => {
                      setMeetingId(activeMeeting.id);
                      setEditingId(observation.id);
                      setCandidate(undefined);
                      setModal("editor");
                    }}
                  >
                    <Plus size={17} />
                    Ajouter un suivi
                  </button>
                )}
              </div>
              {!activeMeeting && (
                <p className="notice">
                  Créez une réunion pour ajouter un suivi. L’historique reste
                  consultable.
                </p>
              )}
              <div className="action-row" style={{ marginBottom: 20 }}>
                <button
                  className="button danger small"
                  disabled={!!busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Supprimer ce point ? Il sera masqué et restaurable dans Transfert → Corbeille. Les bilans déjà clôturés restent historiques ; rouvrez la réunion pour corriger son prompt.",
                      )
                    )
                      void act("Suppression du point…", async () => {
                        await setObservationDeleted(observation.id, true);
                        setObservationId("");
                        setMessage("Point déplacé dans la corbeille.");
                      });
                  }}
                >
                  <Trash2 size={16} />
                  Supprimer ce point
                </button>
              </div>
              <div className="detail-layout">
                <div>
                  <section className="panel">
                    <p className="eyebrow">CONSTAT DE RÉFÉRENCE</p>
                    <p className="preserve">
                      {observation.description ||
                        "Aucune description renseignée."}
                    </p>
                    <p className="helper">
                      Créée le {humanDate(observation.createdAt)} ·{" "}
                      {observation.author}
                    </p>
                    {observation.gps.position ? (
                      <p className="gps-info">
                        <MapPin size={15} />
                        {observation.gps.position.latitude.toFixed(6)},{" "}
                        {observation.gps.position.longitude.toFixed(6)} ·
                        précision ±
                        {Math.round(observation.gps.position.accuracy)} m
                      </p>
                    ) : (
                      <p className="helper">
                        GPS à la création :{" "}
                        {observation.gps.state === "denied"
                          ? "autorisation refusée"
                          : "indisponible"}
                      </p>
                    )}
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Historique du point</h2>
                      <span className="count">
                        {
                          events.filter(
                            (e) => e.observationId === observation.id,
                          ).length
                        }
                      </span>
                    </div>
                    <div className="timeline">
                      {events
                        .filter((e) => e.observationId === observation.id)
                        .sort((a, b) => b.sequence - a.sequence)
                        .map((e) => (
                          <div className="timeline-item" key={e.id}>
                            <div className={`timeline-dot ${e.after.status}`}>
                              {e.after.status === "closed" ? (
                                <Check size={13} />
                              ) : (
                                <span />
                              )}
                            </div>
                            <div>
                              <div className="timeline-top">
                                <strong>{humanDate(e.recordedAt)}</strong>
                                <StatusBadge status={e.after.status} />
                              </div>
                              <small>
                                {meetings.find((m) => m.id === e.meetingId)
                                  ?.type || "Réunion"}{" "}
                                · {e.author}
                              </small>
                              <p className="preserve">{e.comment}</p>
                              {e.before &&
                                JSON.stringify(e.before) !==
                                  JSON.stringify(e.after) && (
                                  <details className="change-details">
                                    <summary>Voir les changements</summary>
                                    {(
                                      Object.keys(
                                        e.after,
                                      ) as (keyof typeof e.after)[]
                                    )
                                      .filter(
                                        (k) => e.before?.[k] !== e.after[k],
                                      )
                                      .map((k) => (
                                        <p key={k}>
                                          <b>
                                            {
                                              {
                                                title: "Titre",
                                                description: "Description",
                                                lot: "Lot",
                                                company: "Entreprise",
                                                status: "État",
                                                priority: "Priorité",
                                              }[k]
                                            }
                                          </b>{" "}
                                          : {e.before?.[k] || "—"} →{" "}
                                          {e.after[k]}
                                        </p>
                                      ))}
                                  </details>
                                )}
                              <div className="photo-grid">
                                {photos
                                  .filter((p) => p.eventId === e.id)
                                  .map((p) => (
                                    <PhotoCard key={p.id} photo={p} />
                                  ))}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>
                </div>
                <aside className="panel detail-side">
                  <p className="eyebrow">SUR LE CHANTIER</p>
                  <h3>Un point, plusieurs réunions.</h3>
                  <p>
                    Chaque suivi conserve son commentaire, ses photos et l’état
                    constaté.
                  </p>
                  {activeMeeting && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        void act("Ajout au programme…", async () => {
                          await markToCheck(activeMeeting.id, observation.id);
                          setMessage(
                            "Point ajouté aux contrôles de la réunion active.",
                          );
                        })
                      }
                    >
                      <Flag size={16} />À contrôler
                    </button>
                  )}
                  <p className="helper">
                    Cette fiche montre l’état actuel du point. Les bilans
                    clôturés restent figés.
                  </p>
                </aside>
              </div>
            </>
          ) : (
            <>
              <button
                className="back-link"
                onClick={() => {
                  setProjectId("");
                  setMeetingId("");
                }}
              >
                <ArrowLeft size={16} />
                Mes chantiers
              </button>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {project.reference || "CHANTIER"} ·{" "}
                    {project.clientName || "MAÎTRE D’OUVRAGE"}
                  </p>
                  <h1>{project.name}</h1>
                  <p className="subtitle">
                    {tab === "meetings" && meeting
                      ? `${meeting.type} · ${humanDate(meeting.date)}`
                      : "La mémoire de votre chantier, conservée sur cet appareil."}
                  </p>
                </div>
                {tab === "meetings" && !meeting && (
                  <button
                    className="button primary"
                    onClick={() => {
                      if (activeMeeting) openMeeting(activeMeeting.id);
                      else setModal("meeting");
                    }}
                  >
                    <Plus size={18} />
                    {activeMeeting
                      ? "Reprendre la réunion"
                      : "Nouvelle réunion"}
                  </button>
                )}
                {((tab === "meetings" &&
                  meeting?.status !== "closed" &&
                  meeting) ||
                  (tab === "observations" && activeMeeting)) && (
                  <button
                    className="button primary"
                    onClick={() => {
                      if (tab === "observations" && activeMeeting)
                        setMeetingId(activeMeeting.id);
                      newObservation();
                    }}
                  >
                    <Plus size={18} />
                    Ajouter un point
                  </button>
                )}
              </div>
              <div className="project-tabs">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    className={tab === t.key ? "active" : ""}
                    onClick={() => {
                      setTab(t.key);
                      if (t.key !== "meetings") setFilter("all");
                    }}
                  >
                    <t.icon size={17} />
                    {t.label}
                  </button>
                ))}
              </div>
              {tab === "meetings" &&
                (!meeting ? (
                  <>
                    <div className="stats-grid">
                      <div className="stat">
                        <span>Points ouverts</span>
                        <strong>
                          {
                            observations.filter((o) => o.status !== "closed")
                              .length
                          }
                        </strong>
                        <small>à suivre sur le chantier</small>
                      </div>
                      <div className="stat">
                        <span>Points bloquants</span>
                        <strong className="red">
                          {
                            observations.filter((o) => o.status === "blocking")
                              .length
                          }
                        </strong>
                        <small>nécessitent une action</small>
                      </div>
                      <div className="stat">
                        <span>Réunions</span>
                        <strong>{meetings.length}</strong>
                        <small>dans la mémoire du projet</small>
                      </div>
                    </div>
                    <div className="section-heading">
                      <h2>Réunions de chantier</h2>
                      <span className="muted">
                        {meetings.length} réunion
                        {meetings.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    {meetings.length ? (
                      <div className="meeting-list">
                        {[...meetings]
                          .sort((a, b) =>
                            b.createdAt.localeCompare(a.createdAt),
                          )
                          .map((m, i) => (
                            <button
                              key={m.id}
                              className="meeting-card"
                              onClick={() => openMeeting(m.id)}
                            >
                              <span className="meeting-calendar">
                                <CalendarDays size={22} />
                              </span>
                              <div>
                                <p className="code">
                                  RÉUNION {meetings.length - i}
                                </p>
                                <h3>{humanDate(m.date)}</h3>
                                <p>{m.type}</p>
                              </div>
                              <span
                                className={`meeting-status ${m.status === "closed" ? "closed" : ""}`}
                              >
                                {m.status === "closed" ? (
                                  <CheckCircle2 size={15} />
                                ) : (
                                  <Clock size={15} />
                                )}{" "}
                                {m.status === "closed"
                                  ? "Clôturée"
                                  : "En cours"}
                              </span>
                              <ChevronRight size={20} />
                            </button>
                          ))}
                      </div>
                    ) : (
                      <div className="empty">
                        <CalendarDays size={32} />
                        <h2>Préparez la première réunion</h2>
                        <p>
                          Importez ensuite le CR précédent pour sélectionner les
                          points à contrôler.
                        </p>
                        <button
                          className="button secondary"
                          onClick={() => setModal("meeting")}
                        >
                          Créer une réunion
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {meeting.status !== "closed" && (
                      <details className="panel">
                        <summary>
                          Modifier la date et le type de réunion
                        </summary>
                        <form
                          className="details-grid"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void act(
                              "Modification de la réunion…",
                              async () => {
                                await updateMeeting(
                                  meeting.id,
                                  String(f.get("date")),
                                  String(f.get("type")),
                                );
                                setMessage("Réunion actualisée.");
                              },
                            );
                          }}
                        >
                          <label>
                            Date
                            <input
                              type="date"
                              name="date"
                              required
                              defaultValue={meeting.date}
                            />
                          </label>
                          <label>
                            Type
                            <input
                              name="type"
                              required
                              defaultValue={meeting.type}
                            />
                          </label>
                          <button
                            className="button secondary"
                            disabled={!!busy}
                          >
                            Enregistrer la réunion
                          </button>
                        </form>
                      </details>
                    )}
                    {meeting.status !== "closed" && (
                      <details className="panel">
                        <summary>
                          Modifier la date et le type de réunion
                        </summary>
                        <form
                          className="details-grid"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void act(
                              "Modification de la réunion…",
                              async () => {
                                await updateMeeting(
                                  meeting.id,
                                  String(f.get("date")),
                                  String(f.get("type")),
                                );
                                setMessage("Réunion actualisée.");
                              },
                            );
                          }}
                        >
                          <label>
                            Date
                            <input
                              type="date"
                              name="date"
                              required
                              defaultValue={meeting.date}
                            />
                          </label>
                          <label>
                            Type
                            <input
                              name="type"
                              required
                              defaultValue={meeting.type}
                            />
                          </label>
                          <button
                            className="button secondary"
                            disabled={!!busy}
                          >
                            Enregistrer la réunion
                          </button>
                        </form>
                      </details>
                    )}
                    <div className="meeting-context">
                      <button
                        className="text-button"
                        onClick={() => setMeetingId("")}
                      >
                        <ArrowLeft size={15} />
                        Toutes les réunions
                      </button>
                      <span
                        className={`meeting-status ${meeting.status === "closed" ? "closed" : ""}`}
                      >
                        {meeting.status === "closed" ? (
                          <CheckCircle2 size={15} />
                        ) : (
                          <Clock size={15} />
                        )}{" "}
                        {meeting.status === "closed"
                          ? "Réunion clôturée"
                          : "Réunion active"}
                      </span>
                      <div className="spacer" />
                      {meeting.status === "closed" && (
                        <button
                          className="button secondary small"
                          disabled={!!busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Rouvrir cette réunion ? Son ancien bilan est conservé. Les corrections actualisent l’état courant du chantier ; les autres bilans clôturés restent inchangés.",
                              )
                            )
                              void act("Réouverture…", async () => {
                                await reopenMeeting(meeting.id);
                                setFilter("all");
                                setMessage(
                                  "Réunion rouverte. Clôturez-la à nouveau après correction pour régénérer le prompt.",
                                );
                              });
                          }}
                        >
                          <RotateCcw size={16} />
                          Rouvrir la réunion
                        </button>
                      )}
                      <button
                        className="button danger small"
                        disabled={!!busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Supprimer cette réunion ? Elle restera restaurable dans la corbeille. Les points créés uniquement dans cette réunion seront aussi masqués ; les points suivis ailleurs seront conservés.",
                            )
                          )
                            void act("Suppression de la réunion…", async () => {
                              await setMeetingDeleted(meeting.id, true);
                              setMeetingId("");
                              setObservationId("");
                              setMessage("Réunion déplacée dans la corbeille.");
                            });
                        }}
                      >
                        <Trash2 size={16} />
                        Supprimer la réunion
                      </button>
                      {meeting.status !== "closed" && (
                        <button
                          className="button secondary small"
                          onClick={() => setModal("report")}
                        >
                          <FileText size={16} />
                          CR précédent
                        </button>
                      )}
                    </div>

                    {revisions.length > 0 && (
                      <details className="panel">
                        <summary>
                          Anciens bilans conservés ({revisions.length})
                        </summary>
                        {revisions.map((r) => (
                          <details key={r.id}>
                            <summary>
                              {humanDate(r.archivedAt)} · {r.reason}
                            </summary>
                            <pre>{r.prompt}</pre>
                            <button
                              className="button secondary small"
                              onClick={() =>
                                download(
                                  new Blob([r.prompt], {
                                    type: "text/plain;charset=utf-8",
                                  }),
                                  `prompt_archive_${r.id}.txt`,
                                )
                              }
                            >
                              Télécharger cet ancien prompt
                            </button>
                          </details>
                        ))}
                      </details>
                    )}
                    {meeting.status === "closed" ? (
                      <section className="copilot-panel">
                        <div className="copilot-heading">
                          <span className="copilot-icon">
                            <FileText size={22} />
                          </span>
                          <div>
                            <p className="eyebrow">PRÊT POUR WORD COPILOT</p>
                            <h2>La réunion est enregistrée.</h2>
                            <p>
                              Mettez à jour votre Word existant à partir des
                              changements ci-dessous.
                            </p>
                          </div>
                        </div>
                        <div className="summary-stats">
                          <span>
                            <b>{snapshot?.newObservationIds.length || 0}</b>{" "}
                            nouveaux
                          </span>
                          <span>
                            <b>
                              {snapshot?.modifiedObservationIds.length || 0}
                            </b>{" "}
                            suivis / modifiés
                          </span>
                          <span>
                            <b>{snapshot?.closedObservationIds.length || 0}</b>{" "}
                            clôturés
                          </span>
                          <span>
                            <b>
                              {snapshot?.uncheckedObservationIds.length || 0}
                            </b>{" "}
                            non contrôlés
                          </span>
                        </div>
                        <div className="action-row">
                          <button
                            className="button primary"
                            disabled={!artifact}
                            onClick={() =>
                              void act("Copie du prompt…", async () => {
                                if (!artifact) return;
                                try {
                                  await navigator.clipboard.writeText(
                                    artifact.text,
                                  );
                                  setMessage(
                                    "Prompt copié. Collez-le dans Copilot avec votre Word existant ouvert.",
                                  );
                                } catch {
                                  download(
                                    new Blob([artifact.text], {
                                      type: "text/plain;charset=utf-8",
                                    }),
                                    "prompt_update.txt",
                                  );
                                  setMessage(
                                    "Copie indisponible : le prompt a été téléchargé.",
                                  );
                                }
                              })
                            }
                          >
                            <Copy size={17} />
                            Copier le prompt
                          </button>
                          <button
                            className="button secondary"
                            disabled={!artifact}
                            onClick={() =>
                              artifact &&
                              download(
                                new Blob([artifact.text], {
                                  type: "text/plain;charset=utf-8",
                                }),
                                "prompt_update.txt",
                              )
                            }
                          >
                            <Download size={17} />
                            Prompt .txt
                          </button>
                          <button
                            className="button secondary"
                            onClick={() =>
                              void act("Export du projet…", () => doExport())
                            }
                          >
                            <Archive size={17} />
                            Sauvegarder le ZIP
                          </button>
                        </div>
                        <details className="prompt-details">
                          <summary>Lire le prompt et le bilan complet</summary>
                          <pre>{artifact?.text}</pre>
                        </details>
                        <p className="helper">
                          Les images doivent être fournies à Word séparément. Le
                          bilan ci-dessous affiche les valeurs figées lors de la
                          clôture.
                        </p>
                      </section>
                    ) : (
                      <>
                        <div className="meeting-preparation">
                          <div>
                            <p className="eyebrow">
                              AVANT ET PENDANT LA RÉUNION
                            </p>
                            <h2>
                              {toCheck.size} point{toCheck.size > 1 ? "s" : ""}{" "}
                              à contrôler
                            </h2>
                            <p>
                              {sourceDocument
                                ? `CR source : ${sourceDocument.name}`
                                : "Les points ouverts du chantier sont repris automatiquement."}
                            </p>
                          </div>
                          <button
                            className="text-button"
                            onClick={() => setModal("report")}
                          >
                            <FileText size={18} />
                            {sourceDocument
                              ? "Vérifier le CR importé"
                              : "Importer le CR précédent"}
                            <ArrowUpRight size={16} />
                          </button>
                        </div>
                        {pending.length > 0 && (
                          <div className="notice">
                            <FileText size={17} />
                            {pending.length} point
                            {pending.length > 1 ? "s" : ""} proposé
                            {pending.length > 1 ? "s" : ""} à vérifier dans le
                            CR.
                            <button
                              className="text-button"
                              onClick={() => setModal("report")}
                            >
                              Examiner
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    {observationRows()}
                    {meeting.status !== "closed" && (
                      <div className="meeting-footer">
                        <span>
                          <ShieldCheck size={16} />
                          Suivis enregistrés sur cet appareil
                        </span>
                        <button
                          className="button dark"
                          onClick={() => setModal("close")}
                        >
                          <CheckCircle2 size={18} />
                          Clôturer la réunion
                        </button>
                      </div>
                    )}
                  </>
                ))}
              {tab === "observations" && (
                <>
                  {!activeMeeting && (
                    <p className="notice">
                      Créez une réunion pour ajouter ou actualiser un point.
                    </p>
                  )}
                  {observationRows()}
                </>
              )}
              {tab === "plans" && (
                <>
                  <div className="section-heading">
                    <h2>Plans du chantier</h2>
                    <label className="button secondary">
                      <Upload size={17} />
                      Importer un PDF
                      <input
                        className="sr-only"
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            void act("Import du plan…", async () => {
                              const p = await addPlan(projectId, f);
                              setPlanId(p.id);
                              setMessage("Plan enregistré sur cet appareil.");
                            });
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {plans.length && plan ? (
                    <>
                      <div className="plan-controls">
                        <label>
                          Plan
                          <select
                            value={plan.id}
                            onChange={(e) => {
                              setPlanId(e.target.value);
                              setPlacing(false);
                            }}
                          >
                            {plans.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Observation à placer
                          <select
                            value={markerObservationId}
                            onChange={(e) =>
                              setMarkerObservationId(e.target.value)
                            }
                          >
                            <option value="">Choisir une observation</option>
                            {observations.map((o) => (
                              <option key={o.id} value={o.id}>
                                {observationCode(o)} — {o.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className={`button ${placing ? "primary" : "secondary"}`}
                          disabled={!markerObservationId}
                          onClick={() => setPlacing(!placing)}
                        >
                          <MapPin size={17} />
                          {placing
                            ? "Annuler le placement"
                            : "Placer sur le plan"}
                        </button>
                      </div>
                      <PDFViewer
                        file={plan.file}
                        markers={markers.filter(
                          (m) =>
                            m.planId === plan.id &&
                            observations.some((o) => o.id === m.observationId),
                        )}
                        observations={observations}
                        placing={placing}
                        onSelect={setObservationId}
                        onPlace={(page, x, y) =>
                          void act("Enregistrement du repère…", async () => {
                            await addMarker(
                              projectId,
                              plan.id,
                              markerObservationId,
                              page,
                              x,
                              y,
                            );
                            setPlacing(false);
                            setMessage("Repère enregistré.");
                          })
                        }
                      />
                      <p className="helper">
                        Les repères restent attachés à leur page et à leur
                        observation, quel que soit le zoom.
                      </p>
                    </>
                  ) : (
                    <div className="empty">
                      <Map size={34} />
                      <h2>Le chantier, sur plan</h2>
                      <p>
                        Importez un PDF puis placez les observations dessus.
                      </p>
                    </div>
                  )}
                </>
              )}
              {tab === "transfer" && (
                <>
                  <section className="panel">
                    <h2>Corbeille du chantier</h2>
                    <p>
                      Les éléments supprimés restent dans la sauvegarde ZIP.
                      Restaurez d’abord leur réunion si elle a été supprimée.
                    </p>
                    {allMeetings
                      .filter((m) => m.deletedAt)
                      .map((m) => (
                        <div className="trash-row" key={m.id}>
                          <span>
                            {humanDate(m.date)} · {m.type}
                          </span>
                          <button
                            className="button secondary small"
                            disabled={!!busy}
                            onClick={() =>
                              void act("Restauration…", async () => {
                                await setMeetingDeleted(m.id, false);
                                setMessage("Réunion restaurée.");
                              })
                            }
                          >
                            <RotateCcw size={16} />
                            Restaurer la réunion
                          </button>
                        </div>
                      ))}
                    {allObservations
                      .filter((o) => o.deletedAt && !o.deletionMeetingId)
                      .map((o) => (
                        <div className="trash-row" key={o.id}>
                          <span>
                            {observationCode(o)} · {o.title}
                          </span>
                          <button
                            className="button secondary small"
                            disabled={!!busy}
                            onClick={() =>
                              void act("Restauration…", async () => {
                                await setObservationDeleted(o.id, false);
                                setMessage("Point restauré.");
                              })
                            }
                          >
                            <RotateCcw size={16} />
                            Restaurer le point
                          </button>
                        </div>
                      ))}
                    {!allMeetings.some((m) => m.deletedAt) &&
                      !allObservations.some((o) => o.deletedAt) && (
                        <p className="helper">La corbeille est vide.</p>
                      )}
                  </section>
                  <div className="transfer-grid">
                    <section className="panel">
                      <span className="feature-icon">
                        <Download size={24} />
                      </span>
                      <h2>Exporter le chantier</h2>
                      <p>
                        Emportez les réunions, les observations, l’historique,
                        les photos, les plans et les prompts dans une archive
                        unique.
                      </p>
                      <button
                        className="button primary"
                        onClick={() =>
                          void act("Export du projet…", () => doExport())
                        }
                      >
                        <Archive size={17} />
                        Exporter le projet ZIP
                      </button>
                      <p className="helper">
                        {photos.length} photo{photos.length > 1 ? "s" : ""} ·{" "}
                        {plans.length} plan{plans.length > 1 ? "s" : ""} ·
                        environ{" "}
                        {(
                          (photos.reduce((n, p) => n + p.image.size, 0) +
                            plans.reduce((n, p) => n + p.file.size, 0) +
                            documents.reduce((n, p) => n + p.file.size, 0)) /
                          1024 /
                          1024
                        ).toFixed(1)}{" "}
                        Mo de médias
                      </p>
                    </section>
                    <section className="panel">
                      <span className="feature-icon">
                        <Upload size={24} />
                      </span>
                      <h2>Importer une archive</h2>
                      <p>
                        Ouvrez le ZIP transféré depuis votre téléphone ou votre
                        ordinateur. Les fichiers sont vérifiés avant l’import.
                      </p>
                      <label className="button secondary">
                        <Upload size={17} />
                        Choisir un ZIP
                        <input
                          className="sr-only"
                          type="file"
                          accept=".zip"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleZip(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <p className="helper">
                        Aucune fusion automatique. Une copie ou un remplacement
                        explicite sera proposé.
                      </p>
                    </section>
                  </div>
                  <section className="panel">
                    <p className="eyebrow">VOTRE PARCOURS</p>
                    <h2>Téléphone → ZIP → PC → Word</h2>
                    <p>
                      Exportez sur le téléphone, transférez le ZIP avec l’outil
                      de votre choix, puis importez-le dans MOE Terrain sur le
                      PC. Ouvrez le compte-rendu Word existant et collez le
                      prompt dans Copilot.
                    </p>
                    <p className="notice">
                      Le transfert vers SwissTransfer est manuel. MOE Terrain
                      n’envoie aucun fichier à un service externe.
                    </p>
                  </section>
                </>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>MOE Terrain · V0.1.1</span>
          <span>Word reste votre référence documentaire.</span>
        </footer>
      </div>
      {project && (
        <nav className="mobile-nav">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "active" : ""}
              onClick={() => {
                setTab(t.key);
                setObservationId("");
                if (t.key !== "meetings") setFilter("all");
              }}
            >
              <t.icon size={21} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
      {modal && (
        <Sheet
          title={
            modal === "project"
              ? "Nouveau chantier"
              : modal === "meeting"
                ? "Nouvelle réunion"
                : modal === "settings"
                  ? "Préférences locales"
                  : modal === "import"
                    ? "Importer un projet"
                    : modal === "report"
                      ? "Préparer les contrôles"
                      : modal === "close"
                        ? "Terminer la réunion"
                        : "Observation terrain"
          }
          onClose={() => {
            if (!busy && !editorBusy) setModal(null);
          }}
        >
          {error && (
            <p className="error modal-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p className="notice modal-error" role="status">
              {busy}
            </p>
          )}
          {modal === "project" && (
            <form
              className="editor"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("Création du chantier…", async () => {
                  const p = await createProject({
                    name: String(f.get("name")),
                    clientName: String(f.get("clientName")),
                    reference: String(f.get("reference")),
                  });
                  chooseProject(p);
                  setModal(null);
                });
              }}
            >
              <p className="eyebrow">UN NOUVEAU FIL DE CHANTIER</p>
              <h2>Créer un projet</h2>
              <label>
                Nom du chantier
                <input
                  name="name"
                  required
                  autoFocus
                  maxLength={200}
                  placeholder="Ex. Réaménagement de la place du village"
                />
              </label>
              <label>
                Maître d’ouvrage
                <input
                  name="clientName"
                  maxLength={300}
                  placeholder="Commune, syndicat, communauté…"
                />
              </label>
              <label>
                Référence affaire
                <input
                  name="reference"
                  maxLength={100}
                  placeholder="Ex. 26-042"
                />
              </label>
              <button className="button primary" disabled={!!busy}>
                Créer le projet
              </button>
            </form>
          )}
          {modal === "meeting" && project && (
            <form
              className="editor"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("Préparation de la réunion…", async () => {
                  const m = await createMeeting(
                    projectId,
                    String(f.get("date")),
                    String(f.get("type")),
                  );
                  openMeeting(m.id);
                  setModal(null);
                });
              }}
            >
              <p className="eyebrow">{project.name}</p>
              <h2>Préparer la réunion</h2>
              <label>
                Date
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={localDate()}
                />
              </label>
              <label>
                Type de réunion
                <input
                  name="type"
                  required
                  defaultValue="Réunion de chantier"
                  maxLength={100}
                />
              </label>
              <p className="notice">
                Les observations ouvertes seront ajoutées aux points à
                contrôler.
              </p>
              <button className="button primary" disabled={!!busy}>
                Ouvrir la réunion
              </button>
            </form>
          )}
          {modal === "editor" && meeting && (
            <ObservationEditor
              key={editingId || initialTitle}
              meeting={meeting}
              observation={observations.find((o) => o.id === editingId)}
              author={author}
              onBusyChange={setEditorBusy}
              initialTitle={initialTitle}
              onCancel={() => setModal(null)}
              onSaved={(id) => {
                if (candidate)
                  void act("Rattachement au CR…", async () => {
                    await decideCandidate(candidate.id, "accepted", id);
                    setCandidate(undefined);
                  });
                setModal(null);
                setObservationId(id);
                setMessage("Observation et historique enregistrés.");
              }}
            />
          )}
          {modal === "close" && meeting && (
            <form
              className="editor"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("Clôture de la réunion…", async () => {
                  await setResumeMarker(meeting.id, String(f.get("marker")));
                  await closeMeeting(meeting.id);
                  setFilter("all");
                  setModal(null);
                  setMessage("Bilan figé et prompt Copilot généré.");
                });
              }}
            >
              <p className="eyebrow">WORD RESTE LE DOCUMENT OFFICIEL</p>
              <h2>Préparer la mise à jour</h2>
              <p>
                {currentEvents.length} suivi
                {currentEvents.length > 1 ? "s" : ""} enregistré
                {currentEvents.length > 1 ? "s" : ""} pendant cette réunion.
              </p>
              {toCheck.size > 0 && (
                <p className="notice">
                  {toCheck.size} point{toCheck.size > 1 ? "s" : ""} n’a
                  {toCheck.size > 1 ? "ont" : ""} pas été contrôlé
                  {toCheck.size > 1 ? "s" : ""}. Ils seront signalés dans le
                  bilan.
                </p>
              )}
              {pending.length > 0 && (
                <p className="notice">
                  {pending.length} suggestion{pending.length > 1 ? "s" : ""} du
                  CR reste{pending.length > 1 ? "nt" : ""} non validée
                  {pending.length > 1 ? "s" : ""}.
                </p>
              )}
              <label>
                Marqueur de reprise exact dans Word
                <input
                  name="marker"
                  required
                  maxLength={500}
                  defaultValue={meeting.resumeMarker}
                />
              </label>
              <p className="helper">
                Insérez ce marqueur une seule fois dans le Word existant, au
                début de la partie modifiable. L’application n’édite pas votre
                Word.
              </p>
              <p className="helper">
                La clôture fige la réunion. Pour corriger ensuite un point,
                ouvrez une nouvelle réunion.
              </p>
              <button className="button primary" disabled={!!busy}>
                <CheckCircle2 size={18} />
                Clôturer et générer le prompt
              </button>
            </form>
          )}
          {modal === "settings" && (
            <div className="editor">
              <p className="eyebrow">SUR CET APPAREIL</p>
              <h2>Votre espace terrain</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act("Enregistrement…", async () => {
                    await db.settings.put({
                      key: "author",
                      value: String(f.get("author")).trim() || "Auteur local",
                    });
                    setMessage("Auteur local enregistré.");
                  });
                }}
              >
                <label>
                  Auteur local
                  <input
                    name="author"
                    defaultValue={author === "Auteur local" ? "" : author}
                    maxLength={200}
                    placeholder="Prénom et nom"
                  />
                </label>
                <p className="helper">
                  Nom indiqué dans les événements. Aucun compte utilisateur.
                </p>
                <button className="button primary" disabled={!!busy}>
                  Enregistrer
                </button>
              </form>
              <hr />
              <h3>Installation et hors ligne</h3>
              <p>
                {ready
                  ? "Les fichiers de l’application sont disponibles hors ligne."
                  : "Attendez que la préparation hors ligne soit terminée avant de partir sur chantier."}
              </p>
              {installEvent ? (
                <button
                  className="button secondary"
                  onClick={() => void installEvent.prompt()}
                >
                  Installer l’application
                </button>
              ) : (
                <p className="helper">
                  iPhone : Safari → Partager → Sur l’écran d’accueil.
                  <br />
                  Android / Windows : menu du navigateur → Installer
                  l’application.
                </p>
              )}
              <h3>Stockage local</h3>
              <p>
                {storage.usage !== undefined
                  ? `${(storage.usage / 1024 / 1024).toFixed(1)} Mo utilisés${storage.quota ? ` sur environ ${(storage.quota / 1024 / 1024 / 1024).toFixed(1)} Go autorisés` : ""}`
                  : "Estimation indisponible"}
              </p>
              <p className="helper">
                Persistance :{" "}
                {storage.persisted
                  ? "accordée"
                  : "non accordée ou non vérifiée"}
                . Une suppression des données du navigateur peut effacer les
                chantiers.
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  void act("Demande de persistance…", async () => {
                    if (!navigator.storage?.persist)
                      throw Error(
                        "Ce navigateur ne propose pas la demande de persistance. Conservez les exports ZIP.",
                      );
                    const persisted = await navigator.storage.persist();
                    setStorage({
                      ...(await navigator.storage?.estimate?.()),
                      persisted,
                    });
                    setMessage(
                      persisted
                        ? "Persistance du stockage accordée."
                        : "Le navigateur n’a pas accordé la persistance. Gardez vos sauvegardes ZIP.",
                    );
                  })
                }
              >
                Demander la conservation du stockage
              </button>
              <hr />
              <div className="about-brand">
                <img
                  src={`${basePath}/branding/naldeo-white.png`}
                  alt="Le Groupe Naldeo"
                />
                <span>MOE Terrain · mémoire du chantier</span>
              </div>
              <p className="helper">
                MOE Terrain V0.1.1 · identité visuelle NALDEO.
                <br />
                Sans synchronisation cloud, sans télémétrie, sans
                authentification.
                <br />
                Le compte-rendu Word reste la référence documentaire officielle.
              </p>
            </div>
          )}
          {modal === "import" && archive && (
            <div className="editor">
              <p className="eyebrow">ARCHIVE VÉRIFIÉE</p>
              <h2>{archive.data.project.name}</h2>
              <p>
                {archive.data.meetings.length} réunion(s),{" "}
                {archive.data.observations.length} observation(s),{" "}
                {archive.photos.length} photo(s), {archive.plans.length}{" "}
                plan(s).
              </p>
              <p className="helper">
                Export du {humanDate(archive.manifest.exportedAt)}
              </p>
              {archive.exists ? (
                <>
                  <p className="notice">
                    Ce projet existe déjà sur cet appareil. Choisissez une copie
                    indépendante ou remplacez-le après sauvegarde.
                  </p>
                  <button
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void act("Import de la copie…", async () => {
                        const p = await commitArchive(archive, "copy");
                        chooseProject(p);
                        setModal(null);
                        setMessage("Copie importée.");
                      })
                    }
                  >
                    Importer comme copie indépendante
                  </button>
                  <button
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void act("Export de sauvegarde…", async () => {
                        await doExport(archive.data.project.id);
                        setBackupDone(true);
                      })
                    }
                  >
                    <Download size={17} />
                    1. Télécharger la sauvegarde locale
                  </button>
                  <button
                    className="button danger"
                    disabled={!backupDone || !!busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remplacer toutes les données locales de ce projet par cette archive ? Vérifiez que la sauvegarde précédente est conservée.",
                        )
                      )
                        void act("Remplacement du projet…", async () => {
                          const p = await commitArchive(archive, "replace");
                          chooseProject(p);
                          setModal(null);
                          setMessage("Projet remplacé par l’archive.");
                        });
                    }}
                  >
                    2. Remplacer le projet local
                  </button>
                </>
              ) : (
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() =>
                    void act("Import du chantier…", async () => {
                      const p = await commitArchive(archive, "new");
                      chooseProject(p);
                      setModal(null);
                      setMessage("Chantier importé.");
                    })
                  }
                >
                  Importer le chantier
                </button>
              )}
            </div>
          )}
          {modal === "report" && meeting && (
            <div className="editor">
              <p className="eyebrow">ASSISTANCE LOCALE · VALIDATION HUMAINE</p>
              <h2>Les points du CR précédent</h2>
              <p>
                Les propositions sont extraites par règles textuelles.
                Vérifiez-les avant de les ajouter aux contrôles.
              </p>
              {meeting.status !== "closed" && (
                <label className="button secondary">
                  <Upload size={18} />
                  Importer un DOCX ou PDF
                  <input
                    className="sr-only"
                    type="file"
                    accept=".docx,.pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        void act(
                          "Lecture locale du compte-rendu…",
                          async () => {
                            const r = await importReport(meeting.id, f);
                            setMessage(
                              r.document.text.trim()
                                ? `${r.candidates.length} proposition(s) trouvée(s). Vérifiez leur contexte.`
                                : "Aucun texte extractible : PDF probablement scanné. Ajoutez les points manuellement.",
                            );
                          },
                        );
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {sourceDocument && (
                <>
                  <div className="source-heading">
                    <strong>{sourceDocument.name}</strong>
                    <button
                      className="text-button"
                      onClick={() =>
                        download(sourceDocument.file, sourceDocument.name)
                      }
                    >
                      <Download size={15} />
                      Original
                    </button>
                  </div>
                  <details>
                    <summary>Lire le texte extrait</summary>
                    <pre className="source-text">
                      {sourceDocument.text ||
                        "Aucun texte extractible. Consultez le document original."}
                    </pre>
                  </details>
                  {sourceDocument.format === "pdf" && (
                    <details>
                      <summary>Afficher le PDF</summary>
                      <PDFViewer file={sourceDocument.file} />
                    </details>
                  )}
                </>
              )}
              {pending.map((c) => (
                <div key={c.id} className="candidate">
                  <small>
                    {documents.find((d) => d.id === c.sourceDocumentId)?.name}
                    {c.page ? ` · page ${c.page}` : ""}
                  </small>
                  <p className="preserve">{c.text}</p>
                  <div className="action-row">
                    <button
                      className="button secondary small"
                      disabled={!!busy || meeting.status === "closed"}
                      onClick={() => newObservation(c.text.slice(0, 300), c)}
                    >
                      <Plus size={15} />
                      Créer un point
                    </button>
                    <button
                      className="text-button"
                      disabled={!!busy || meeting.status === "closed"}
                      onClick={() =>
                        void act("Validation…", async () => {
                          await decideCandidate(c.id, "dismissed");
                        })
                      }
                    >
                      Écarter
                    </button>
                  </div>
                  <label>
                    Ou rattacher à un point existant
                    <select
                      defaultValue=""
                      disabled={meeting.status === "closed" || !!busy}
                      onChange={(e) => {
                        if (e.target.value)
                          void act("Rattachement…", async () => {
                            await decideCandidate(
                              c.id,
                              "accepted",
                              e.target.value,
                            );
                            setMessage("Point existant ajouté aux contrôles.");
                          });
                      }}
                    >
                      <option value="">Choisir une observation</option>
                      {observations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {observationCode(o)} — {o.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
              {!pending.length && (
                <p className="helper">
                  Aucune proposition en attente. Les PDF scannés ne sont pas
                  reconnus automatiquement dans cette version.
                </p>
              )}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
