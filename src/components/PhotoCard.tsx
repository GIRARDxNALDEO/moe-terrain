"use client";
import { useEffect, useState } from "react";
import type { Photo } from "@/lib/models";
import { download } from "@/lib/archives";
export default function PhotoCard({ photo }: { photo: Photo }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const u = URL.createObjectURL(photo.image);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo.image]);
  return (
    <button
      className="photo-card"
      onClick={() => download(photo.image, photo.originalName)}
      title="Télécharger la photo originale"
    >
      {failed ? (
        <div className="photo-fallback">
          Aperçu indisponible
          <br />
          Télécharger l’original
        </div>
      ) : (
        url && (
          <img
            src={url}
            alt={photo.originalName}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )
      )}
      <span>{photo.originalName}</span>
      <small>
        Ajout : {new Date(photo.addedAt).toLocaleString("fr-FR")}
        {photo.gps.position
          ? ` · ±${Math.round(photo.gps.position.accuracy)} m`
          : " · Sans GPS"}
      </small>
    </button>
  );
}
