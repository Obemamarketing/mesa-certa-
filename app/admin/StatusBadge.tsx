export default function StatusBadge({ cancelada }: { cancelada?: boolean }) {
  if (cancelada) {
    return (
      <span
        className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
        style={{ background: "var(--color-error-soft)", color: "var(--color-error)" }}
      >
        Cancelada
      </span>
    );
  }
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
      style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-dark)" }}
    >
      Confirmada
    </span>
  );
}
