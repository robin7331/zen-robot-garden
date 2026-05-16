// GLB-3D-Modelle als URL importieren (Vite löst `?url` zur fertigen Adresse auf).
declare module '*.glb?url' {
  const url: string;
  export default url;
}
