import ScreenshotPlaceholder from './ScreenshotPlaceholder';

// Print real de uma tela do sistema; sem imagem, mostra o placeholder.
export default function PrintDaTela({ src, label, fase, encaixe = 'cover', className = '' }) {
  if (!src) return <ScreenshotPlaceholder label={label} fase={fase} className={className} />;

  return (
    <div
      className={`w-full aspect-[16/10] rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[#0A192F] shadow-lg ${className}`}
    >
      <img
        src={src}
        alt={label}
        loading="lazy"
        className={`w-full h-full ${encaixe === 'contain' ? 'object-contain' : 'object-cover object-top'}`}
      />
    </div>
  );
}
