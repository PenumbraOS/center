export interface PackageStatusRowViewModel {
  readonly id: string;
  readonly role: string;
  readonly value: string;
  readonly tone: "default" | "success" | "warning";
  readonly category?: "managed" | "conflict";
  readonly badge?: string | null;
}

export function PackageStatusList({
  rows,
  conflictRows = [],
  ariaLabel,
  topPadding = false,
}: {
  rows: readonly PackageStatusRowViewModel[];
  conflictRows?: readonly PackageStatusRowViewModel[];
  ariaLabel: string;
  topPadding?: boolean;
}) {
  if (rows.length === 0 && conflictRows.length === 0) {
    return null;
  }

  return (
    <dl
      className={`install-stage__packages${topPadding ? " install-stage__packages--top-padding" : ""}`}
      aria-label={ariaLabel}
    >
      {rows.map((row) => (
        <PackageStatusRow key={row.id} row={row} />
      ))}
      {conflictRows.length > 0 ? (
        <div className="install-stage__packages-divider" aria-hidden="true">
          <span>Installation Conflicts</span>
        </div>
      ) : null}
      {conflictRows.map((row) => (
        <PackageStatusRow key={row.id} row={row} conflict />
      ))}
    </dl>
  );
}

function PackageStatusRow({
  row,
  conflict = false,
}: {
  row: PackageStatusRowViewModel;
  conflict?: boolean;
}) {
  return (
    <div
      className={`install-stage__package${conflict ? " install-stage__package--conflict" : ""}`}
    >
      <dt>{row.role}</dt>
      <dd
        className={`install-stage__package-value install-stage__package-value--${row.tone}`}
        title={row.value}
      >
        {conflict ? (
          <>
            <span className="install-stage__package-conflict-copy">
              {row.value}
            </span>
            {row.badge ? (
              <span className="install-stage__package-badge install-stage__package-badge--warning">
                {row.badge}
              </span>
            ) : null}
          </>
        ) : (
          row.value
        )}
      </dd>
    </div>
  );
}
