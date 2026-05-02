import type { ReactNode } from "react";

interface SiteChromeProps {
  /**
   * URL the logo links to. Defaults to "/" so it returns to the marketing
   * site (Hugo root) from any embedded SPA.
   */
  readonly logoHref?: string;
  /** Product title shown beside the logo. */
  readonly title?: ReactNode;
  /** Primary nav slot (between logo and right meta). */
  readonly nav?: ReactNode;
  /** Right-side meta slot (status indicator, device name, etc.). */
  readonly meta?: ReactNode;
  readonly children: ReactNode;
}

function GithubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function LogoMark() {
  return (
    <>
      <img
        className="logo-icon"
        src="/img/logo.png"
        width={28}
        height={28}
        alt=""
        aria-hidden="true"
      />
      <span>PenumbraOS</span>
    </>
  );
}

export default function SiteChrome({
  logoHref = "/",
  title,
  nav,
  meta,
  children,
}: SiteChromeProps) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner app-header-inner">
          <a href={logoHref} className="site-logo">
            <LogoMark />
          </a>
          {title && (
            <>
              <span>|</span>
              <span className="site-title">{title}</span>
            </>
          )}
          {nav}
          <div className="app-header-right">
            {meta && <div className="app-header-meta">{meta}</div>}
            <a
              href="https://github.com/PenumbraOS/"
              className="nav-link nav-link--github"
              target="_blank"
              rel="noopener"
              aria-label="GitHub"
            >
              <GithubIcon />
            </a>
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-info">
            <p className="footer-note">
              PenumbraOS is not affiliated with Humane Inc. or HP Inc. The Ai
              Pin trademark and archived content remains property of HP.
            </p>
          </div>
          <div className="footer-links">
            <a
              href="https://github.com/PenumbraOS/"
              className="footer-link"
              target="_blank"
              rel="noopener"
            >
              <GithubIcon />
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
