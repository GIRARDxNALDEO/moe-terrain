import Dexie, { type EntityTable } from "dexie";
import type {
  Project,
  Meeting,
  Observation,
  ObservationEvent,
  MeetingObservation,
  Photo,
  Plan,
  PlanMarker,
  SourceDocument,
  ReviewCandidate,
  Snapshot,
  Artifact,
  Setting,
} from "./models";
export class TerrainDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  meetings!: EntityTable<Meeting, "id">;
  observations!: EntityTable<Observation, "id">;
  observationEvents!: EntityTable<ObservationEvent, "id">;
  meetingObservations!: EntityTable<MeetingObservation, "id">;
  photos!: EntityTable<Photo, "id">;
  plans!: EntityTable<Plan, "id">;
  planMarkers!: EntityTable<PlanMarker, "id">;
  sourceDocuments!: EntityTable<SourceDocument, "id">;
  reviewCandidates!: EntityTable<ReviewCandidate, "id">;
  meetingSnapshots!: EntityTable<Snapshot, "id">;
  generatedArtifacts!: EntityTable<Artifact, "id">;
  settings!: EntityTable<Setting, "key">;
  constructor(name = "moe-terrain") {
    super(name);
    this.version(1).stores({
      projects: "id,updatedAt",
      meetings: "id,projectId,[projectId+date]",
      observations: "id,projectId,[projectId+status],&[projectId+number]",
      observationEvents:
        "id,projectId,observationId,meetingId,[observationId+recordedAt],&[observationId+sequence]",
      meetingObservations:
        "id,&[meetingId+observationId],meetingId,observationId",
      photos: "id,projectId,observationId,eventId",
      plans: "id,projectId",
      planMarkers: "id,projectId,[planId+page],planId,observationId",
      sourceDocuments: "id,projectId,meetingId",
      reviewCandidates: "id,meetingId,sourceDocumentId",
      meetingSnapshots: "id,&meetingId,projectId",
      generatedArtifacts: "id,meetingId,projectId",
      settings: "key",
    });
  }
}
export const db = new TerrainDB();
