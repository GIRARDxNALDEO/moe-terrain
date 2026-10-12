"use client";
import dynamic from "next/dynamic";
const App = dynamic(() => import("@/components/TerrainApp"), {
  ssr: false,
  loading: () => (
    <div className="boot">
      <div className="boot-mark">M</div>
      <h1>MOE Terrain</h1>
      <p>Ouverture de votre espace chantier…</p>
    </div>
  ),
});
export default function Page() {
  return <App />;
}
