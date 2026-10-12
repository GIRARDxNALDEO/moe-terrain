"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="boot">
      <div className="boot-mark">M</div>
      <h1>Ouverture impossible</h1>
      <p style={{ maxWidth: 450, textAlign: "center", padding: 20 }}>
        Vérifiez que le stockage local est autorisé dans ce navigateur. Fermez
        les autres fenêtres de l’application, puis réessayez. Conservez vos
        archives ZIP et ne supprimez pas les données du navigateur sans
        sauvegarde.
      </p>
      <button className="button primary" onClick={reset}>
        Réessayer
      </button>
    </main>
  );
}
